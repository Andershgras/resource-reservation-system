using Microsoft.EntityFrameworkCore;
using ResourceReservation.Api.Data;
using System.Net;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Cors.Infrastructure;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi;
using ResourceReservation.Api.Models;
using ResourceReservation.Api.Configuration;
using ResourceReservation.Api.Services;

const string frontendCorsPolicy = "FrontendCors";
const string readyHealthCheckTag = "ready";

var builder = WebApplication.CreateBuilder(args);

// Every error response is RFC 9457 ProblemDetails, including model validation
// errors (ValidationProblemDetails) and unhandled exceptions.
builder.Services.AddControllers();
builder.Services.AddProblemDetails();
// Generated links and Location headers use lowercase paths, such as /api/reservations/1.
builder.Services.Configure<RouteOptions>(options => options.LowercaseUrls = true);
// Cross-origin browser calls are allowed only from the origins in Cors:AllowedOrigins,
// plus the local Vite dev server in Development.
builder.Services.AddCors();
builder.Services.AddOptions<CorsOptions>()
    .Configure<IOptions<FrontendCorsOptions>, IWebHostEnvironment>((options, frontendCors, environment) =>
    {
        options.AddPolicy(frontendCorsPolicy, policy =>
        {
            policy
                .SetIsOriginAllowed(origin =>
                    frontendCors.Value.IsAllowed(origin) ||
                    (environment.IsDevelopment() && IsLocalViteOrigin(origin)))
                .WithMethods("GET", "POST", "PUT", "DELETE")
                .AllowAnyHeader()
                .WithExposedHeaders("Retry-After");
        });
    });

var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");

if (string.IsNullOrWhiteSpace(connectionString))
{
    throw new InvalidOperationException("ConnectionStrings:DefaultConnection is required.");
}

builder.Services.AddDbContext<AppDbContext>(options => options.UseSqlServer(connectionString));
builder.Services.AddScoped<AvailabilityService>();
builder.Services.AddScoped<ApplicationLocks>();
builder.Services.AddScoped<ReservationService>();
builder.Services.AddScoped<AvailabilityExceptionService>();
builder.Services.AddScoped<JwtTokenService>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<UserSessionValidator>();
builder.Services.AddScoped<UserService>();
builder.Services.AddSingleton<IPasswordHasher<User>, PasswordHasher<User>>();

// Settings are validated when the app starts, so bad configuration never serves a request.
builder.Services.AddOptions<JwtOptions>()
    .Bind(builder.Configuration.GetSection(JwtOptions.SectionName))
    .ValidateDataAnnotations()
    .ValidateOnStart();
builder.Services.AddOptions<SchedulingOptions>()
    .Bind(builder.Configuration.GetSection(SchedulingOptions.SectionName))
    .ValidateDataAnnotations()
    .ValidateOnStart();
builder.Services.AddOptions<BookingPolicyOptions>()
    .Bind(builder.Configuration.GetSection(BookingPolicyOptions.SectionName))
    .ValidateDataAnnotations()
    .ValidateOnStart();
builder.Services.AddOptions<FrontendCorsOptions>()
    .Bind(builder.Configuration.GetSection(FrontendCorsOptions.SectionName))
    .ValidateDataAnnotations()
    .ValidateOnStart();
builder.Services.AddOptions<ReverseProxyOptions>()
    .Bind(builder.Configuration.GetSection(ReverseProxyOptions.SectionName))
    .ValidateDataAnnotations()
    .ValidateOnStart();
builder.Services.AddOptions<AuthRateLimitOptions>()
    .Bind(builder.Configuration.GetSection(AuthRateLimitOptions.SectionName))
    .ValidateDataAnnotations()
    .ValidateOnStart();
builder.Services.AddOptions<AccountLockoutOptions>()
    .Bind(builder.Configuration.GetSection(AccountLockoutOptions.SectionName))
    .ValidateDataAnnotations()
    .ValidateOnStart();
builder.Services.AddOptions<SeedAdminOptions>()
    .Bind(builder.Configuration.GetSection(SeedAdminOptions.SectionName))
    .ValidateDataAnnotations()
    .ValidateOnStart();

builder.Services.AddOptions<ForwardedHeadersOptions>()
    .Configure<IOptions<ReverseProxyOptions>>((options, reverseProxy) =>
    {
        options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;

        // Only the configured proxies are trusted, not the framework's default of loopback.
        options.KnownProxies.Clear();
        options.KnownIPNetworks.Clear();

        foreach (var proxy in reverseProxy.Value.KnownProxies)
        {
            options.KnownProxies.Add(IPAddress.Parse(proxy));
        }

        foreach (var network in reverseProxy.Value.KnownNetworks)
        {
            options.KnownIPNetworks.Add(System.Net.IPNetwork.Parse(network));
        }
    });

builder.Services.AddAuthRateLimiting();

// Readiness checks that the database is reachable. Liveness runs no checks.
builder.Services.AddHealthChecks()
    .AddDbContextCheck<AppDbContext>(tags: [readyHealthCheckTag]);

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton(serviceProvider => new SchedulingClock(
    serviceProvider.GetRequiredService<TimeProvider>(),
    serviceProvider.GetRequiredService<IOptions<SchedulingOptions>>().Value.GetTimeZone()));

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer();
builder.Services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
    .Configure<IOptions<JwtOptions>>((options, jwtOptions) =>
    {
        var jwt = jwtOptions.Value;

        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwt.Issuer,
            ValidAudience = jwt.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Key))
        };
        options.Events = new JwtBearerEvents
        {
            // A valid signature isn't enough: the user must still be active, with
            // the same role and security stamp as when the token was issued.
            OnTokenValidated = async context =>
            {
                var validator = context.HttpContext.RequestServices.GetRequiredService<UserSessionValidator>();

                if (!await validator.IsCurrentAsync(context.Principal!))
                {
                    context.Fail("The token's user is no longer active or has changed.");
                }
            },
            OnChallenge = context =>
            {
                context.HandleResponse();

                return WriteProblemAsync(
                    context.HttpContext,
                    StatusCodes.Status401Unauthorized,
                    "Authentication is required.");
            },
            OnForbidden = context => WriteProblemAsync(
                context.HttpContext,
                StatusCodes.Status403Forbidden,
                "You do not have permission to access this resource.")
        };
    });

builder.Services.AddAuthorization();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "Enter your JWT token without the Bearer prefix."
    });

    options.AddSecurityRequirement(document => new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecuritySchemeReference("Bearer", document, null),
            new List<string>()
        }
    });
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    using var scope = app.Services.CreateScope();
    var context = scope.ServiceProvider.GetRequiredService<AppDbContext>();

    await DevelopmentDemoDataSeeder.SeedAsync(context);
}

using (var scope = app.Services.CreateScope())
{
    var seedAdmin = scope.ServiceProvider.GetRequiredService<IOptions<SeedAdminOptions>>().Value;
    var context = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var adminEmail = seedAdmin.Email?.Trim().ToLowerInvariant() ?? string.Empty;
    var adminPassword = seedAdmin.Password;
    var adminName = seedAdmin.Name?.Trim();

    if (seedAdmin.IsConfigured &&
        !await context.Users.AnyAsync(user => user.Email == adminEmail) &&
        !await context.Users.AnyAsync(user => user.Role == UserRoles.Admin))
    {
        var adminUser = new User
        {
            Name = string.IsNullOrWhiteSpace(adminName) ? "Admin" : adminName,
            Email = adminEmail,
            Role = UserRoles.Admin,
            CreatedAt = DateTimeOffset.UtcNow
        };

        var passwordHasher = new PasswordHasher<User>();
        adminUser.PasswordHash = passwordHasher.HashPassword(adminUser, adminPassword!);

        context.Users.Add(adminUser);
        await context.SaveChangesAsync();
    }
}

// Configure the HTTP request pipeline.
// Behind a reverse proxy, take the client IP and scheme from the proxy's forwarded
// headers. The middleware trusts every proxy when its lists are empty, so it is
// only added when proxies are configured.
if (app.Services.GetRequiredService<IOptions<ReverseProxyOptions>>().Value.IsConfigured)
{
    app.UseForwardedHeaders();
}

// Logs unhandled exceptions and returns a 500 ProblemDetails without exception details.
app.UseExceptionHandler();

if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
}

app.UseSecurityHeaders();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

app.UseCors(frontendCorsPolicy);
// After CORS, so the browser can read a 429 response.
app.UseRateLimiter();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

// For the hosting platform. Both are anonymous, are not rate limited, and return
// only "Healthy" or "Unhealthy" (503), never error details.
app.MapHealthChecks("/health/live", new HealthCheckOptions { Predicate = _ => false });
app.MapHealthChecks("/health/ready", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains(readyHealthCheckTag)
});

app.Run();

static async Task WriteProblemAsync(HttpContext httpContext, int statusCode, string detail)
{
    httpContext.Response.StatusCode = statusCode;

    await httpContext.RequestServices
        .GetRequiredService<IProblemDetailsService>()
        .TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            ProblemDetails = { Status = statusCode, Detail = detail }
        });
}

// The Vite dev server, which picks the next free port from 5173.
static bool IsLocalViteOrigin(string origin)
{
    return Uri.TryCreate(origin, UriKind.Absolute, out var uri) &&
        (uri.Host == "localhost" || uri.Host == "127.0.0.1") &&
        uri.Port >= 5173 &&
        uri.Port <= 5185;
}

// Exposes the entry point to WebApplicationFactory in the integration tests.
public partial class Program
{
}
