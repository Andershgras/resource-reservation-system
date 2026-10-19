using Microsoft.EntityFrameworkCore;
using ResourceReservation.Api.Data;
using System.Net;
using System.Text;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.DataProtection;
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
builder.Services.AddScoped<AccountService>();
builder.Services.AddScoped<UserTokenService>();
builder.Services.AddScoped<AccountEmails>();
builder.Services.AddScoped<BookingEmails>();
builder.Services.AddScoped<EmailOutboxProcessor>();
// Emails go through the sender Email:Delivery names, which is validated at
// startup: an SMTP server, or the development pickup directory.
builder.Services.AddSingleton<SmtpEmailSender>();
builder.Services.AddSingleton<PickupDirectoryEmailSender>();
builder.Services.AddSingleton<IEmailSender>(serviceProvider =>
    serviceProvider.GetRequiredService<IOptions<EmailOptions>>().Value.Delivery == EmailOptions.SmtpDelivery
        ? serviceProvider.GetRequiredService<SmtpEmailSender>()
        : serviceProvider.GetRequiredService<PickupDirectoryEmailSender>());
builder.Services.AddSingleton<AccountEmailQueue>();
builder.Services.AddHostedService<AccountEmailDispatcher>();
builder.Services.AddHostedService<EmailOutboxWorker>();
builder.Services.AddScoped<DataRetention>();
builder.Services.AddHostedService<DataRetentionWorker>();
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
builder.Services.AddOptions<EmailOptions>()
    .Bind(builder.Configuration.GetSection(EmailOptions.SectionName))
    .ValidateDataAnnotations()
    .ValidateOnStart();
builder.Services.AddOptions<FrontendOptions>()
    .Bind(builder.Configuration.GetSection(FrontendOptions.SectionName))
    .ValidateDataAnnotations()
    .ValidateOnStart();
builder.Services.AddOptions<AccountTokenOptions>()
    .Bind(builder.Configuration.GetSection(AccountTokenOptions.SectionName))
    .ValidateDataAnnotations()
    .ValidateOnStart();
builder.Services.AddOptions<EmailOutboxOptions>()
    .Bind(builder.Configuration.GetSection(EmailOutboxOptions.SectionName))
    .ValidateDataAnnotations()
    .ValidateOnStart();
builder.Services.AddOptions<EmailRateLimitOptions>()
    .Bind(builder.Configuration.GetSection(EmailRateLimitOptions.SectionName))
    .ValidateDataAnnotations()
    .ValidateOnStart();
// Relaxed cookies are for the Vite dev server on plain http://localhost only.
// Anywhere else the API refuses to start with them, so production always uses
// __Host- cookies that are only sent over HTTPS (ADR 0012).
builder.Services.AddOptions<AuthCookieOptions>()
    .Bind(builder.Configuration.GetSection(AuthCookieOptions.SectionName))
    .Validate<IHostEnvironment>(
        (options, environment) => !options.AllowInsecureDevelopmentCookies || environment.IsDevelopment(),
        "AuthCookies:AllowInsecureDevelopmentCookies is only allowed in the Development environment.")
    .ValidateOnStart();
builder.Services.AddOptions<RetentionOptions>()
    .Bind(builder.Configuration.GetSection(RetentionOptions.SectionName))
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

// Data Protection keys protect the anti-forgery tokens. Kept in a folder when
// DataProtection:KeysDirectory is set, as in Docker Compose, so tokens survive
// a restart. Session tokens are JWTs and don't depend on these keys.
var dataProtection = builder.Services.AddDataProtection().SetApplicationName("ResourceReservation");
var keysDirectory = builder.Configuration["DataProtection:KeysDirectory"];

if (!string.IsNullOrWhiteSpace(keysDirectory))
{
    dataProtection.PersistKeysToFileSystem(new DirectoryInfo(keysDirectory));
}

builder.Services.AddAntiforgery();
builder.Services.AddOptions<AntiforgeryOptions>()
    .Configure<IOptions<AuthCookieOptions>>((options, authCookies) =>
    {
        options.HeaderName = AuthCookieOptions.AntiforgeryHeaderName;
        options.Cookie.Name = authCookies.Value.AntiforgeryCookie;
        options.Cookie.HttpOnly = true;
        options.Cookie.SameSite = SameSiteMode.Strict;
        options.Cookie.SecurePolicy = authCookies.Value.SecurePolicy;
        options.Cookie.Path = "/";
        // The security headers already send X-Frame-Options: DENY.
        options.SuppressXFrameOptionsHeader = true;
    });

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
            // A bearer header wins. Without one, the token comes from the
            // httpOnly session cookie that POST /api/auth/login sets.
            OnMessageReceived = context =>
            {
                var authorization = context.Request.Headers.Authorization.ToString();

                if (authorization.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
                {
                    CsrfProtection.MarkBearerHeader(context.HttpContext);
                    return Task.CompletedTask;
                }

                var cookieName = context.HttpContext.RequestServices
                    .GetRequiredService<IOptions<AuthCookieOptions>>().Value.SessionCookie;
                var cookieToken = context.Request.Cookies[cookieName];

                if (!string.IsNullOrEmpty(cookieToken))
                {
                    context.Token = cookieToken;
                }

                return Task.CompletedTask;
            },
            // A valid signature isn't enough: the user must still be active, with
            // the same role and security stamp as when the token was issued, and
            // the token's session must not have expired or been revoked.
            OnTokenValidated = async context =>
            {
                var validator = context.HttpContext.RequestServices.GetRequiredService<UserSessionValidator>();
                var session = await validator.ValidateAsync(context.Principal!);

                if (session is null)
                {
                    context.Fail("The token's user or session is no longer current.");
                    return;
                }

                context.HttpContext.Features.Set(session);

                // Only a bearer header that passed every check exempts the
                // request from CSRF protection.
                if (CsrfProtection.HasBearerHeader(context.HttpContext))
                {
                    CsrfProtection.MarkValidatedBearer(context.HttpContext);
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
        Description = "A token from POST /api/auth/token, without the Bearer prefix."
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

// Validation allows unencrypted SMTP only for a local test mail catcher, and
// only when asked for explicitly. Say so in the log every time it is used.
var emailOptions = app.Services.GetRequiredService<IOptions<EmailOptions>>().Value;

if (emailOptions.Delivery == EmailOptions.SmtpDelivery && emailOptions.Smtp.IsInsecure)
{
    app.Logger.LogWarning(
        "Emails are sent to {SmtpHost} without TLS (Email:Smtp:Security None). Only use this with a local test mail catcher.",
        emailOptions.Smtp.Host);
}

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
            CreatedAt = DateTimeOffset.UtcNow,
            // Configured by whoever runs the system, so there is nothing to verify.
            IsEmailConfirmed = true,
            EmailConfirmedAt = DateTimeOffset.UtcNow
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
// After authentication, so it knows whether a bearer token was accepted, and
// after authorization, so an unauthenticated request to a protected endpoint
// gets its 401 first. Before the endpoints, so a rejected request changes nothing.
app.UseCsrfProtection();

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
