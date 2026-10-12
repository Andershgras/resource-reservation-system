using Microsoft.EntityFrameworkCore;
using ResourceReservation.Api.Data;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi;
using ResourceReservation.Api.Models;
using ResourceReservation.Api.Configuration;
using ResourceReservation.Api.Services;

const string frontendDevelopmentCorsPolicy = "FrontendDevelopmentCors";

var builder = WebApplication.CreateBuilder(args);

// Every error response is RFC 9457 ProblemDetails, including model validation
// errors (ValidationProblemDetails) and unhandled exceptions.
builder.Services.AddControllers();
builder.Services.AddProblemDetails();
builder.Services.AddCors(options =>
{
    options.AddPolicy(frontendDevelopmentCorsPolicy, policy =>
    {
        policy
            .SetIsOriginAllowed(origin =>
            {
                if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri))
                {
                    return false;
                }

                return (uri.Host == "localhost" || uri.Host == "127.0.0.1") &&
                    uri.Port >= 5173 &&
                    uri.Port <= 5185;
            })
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");

if (string.IsNullOrWhiteSpace(connectionString))
{
    throw new InvalidOperationException("ConnectionStrings:DefaultConnection is required.");
}

builder.Services.AddDbContext<AppDbContext>(options => options.UseSqlServer(connectionString));
builder.Services.AddScoped<AvailabilityService>();
builder.Services.AddScoped<ReservationService>();
builder.Services.AddScoped<JwtTokenService>();
builder.Services.AddScoped<AuthService>();

// Settings are validated when the app starts, so bad configuration never serves a request.
builder.Services.AddOptions<JwtOptions>()
    .Bind(builder.Configuration.GetSection(JwtOptions.SectionName))
    .ValidateDataAnnotations()
    .ValidateOnStart();
builder.Services.AddOptions<SchedulingOptions>()
    .Bind(builder.Configuration.GetSection(SchedulingOptions.SectionName))
    .ValidateDataAnnotations()
    .ValidateOnStart();
builder.Services.AddOptions<SeedAdminOptions>()
    .Bind(builder.Configuration.GetSection(SeedAdminOptions.SectionName))
    .ValidateDataAnnotations()
    .ValidateOnStart();

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
        !await context.Users.AnyAsync(user => user.Role == "Admin"))
    {
        var adminUser = new User
        {
            Name = string.IsNullOrWhiteSpace(adminName) ? "Admin" : adminName,
            Email = adminEmail,
            Role = "Admin"
        };

        var passwordHasher = new PasswordHasher<User>();
        adminUser.PasswordHash = passwordHasher.HashPassword(adminUser, adminPassword!);

        context.Users.Add(adminUser);
        await context.SaveChangesAsync();
    }
}

// Configure the HTTP request pipeline.
// Logs unhandled exceptions and returns a 500 ProblemDetails without exception details.
app.UseExceptionHandler();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

if (app.Environment.IsDevelopment())
{
    app.UseCors(frontendDevelopmentCorsPolicy);
}

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

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

// Exposes the entry point to WebApplicationFactory in the integration tests.
public partial class Program
{
}
