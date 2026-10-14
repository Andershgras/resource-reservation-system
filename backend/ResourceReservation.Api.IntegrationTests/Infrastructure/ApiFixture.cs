using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using ResourceReservation.Api.Data;
using ResourceReservation.Api.Models;
using ResourceReservation.Api.Services;
using Respawn;
using Testcontainers.MsSql;

namespace ResourceReservation.Api.IntegrationTests.Infrastructure;

// Starts one SQL Server for the whole test run, applies the real migrations,
// and hosts the API in memory against it.
public sealed class ApiFixture : IAsyncLifetime
{
    public const string AdminEmail = "admin@integration.test";
    public const string AdminPassword = "AdminPassword123";

    private const string ConnectionStringVariable = "INTEGRATION_TEST_CONNECTION_STRING";
    private const string DatabaseName = "ResourceReservation_IntegrationTests";
    private const string RequiredDatabaseSuffix = "_IntegrationTests";

    private MsSqlContainer? _container;
    private Respawner? _respawner;

    public string ConnectionString { get; private set; } = string.Empty;

    public ApiFactory Factory { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        ConnectionString = await GetConnectionStringAsync();
        EnsureDisposableDatabase(ConnectionString);

        await using (var context = CreateDbContext())
        {
            await context.Database.MigrateAsync();
        }

        await using (var connection = await OpenConnectionAsync())
        {
            _respawner = await Respawner.CreateAsync(connection, new RespawnerOptions
            {
                DbAdapter = DbAdapter.SqlServer,
                TablesToIgnore = ["__EFMigrationsHistory"]
            });

            // Remove anything left behind by a previous run against a reused database.
            await _respawner.ResetAsync(connection);
        }

        Factory = new ApiFactory(ConnectionString);
    }

    public async Task DisposeAsync()
    {
        await Factory.DisposeAsync();

        if (_container is not null)
        {
            await _container.DisposeAsync();
        }
    }

    public async Task ResetDatabaseAsync()
    {
        await using (var connection = await OpenConnectionAsync())
        {
            await _respawner!.ResetAsync(connection);
        }

        TestEmailSink.Instance.Clear();
        await SeedAdminAsync();
    }

    private async Task<SqlConnection> OpenConnectionAsync()
    {
        var connection = new SqlConnection(ConnectionString);
        await connection.OpenAsync();

        return connection;
    }

    public AppDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlServer(ConnectionString)
            .Options;

        return new AppDbContext(options);
    }

    private async Task SeedAdminAsync()
    {
        await using var context = CreateDbContext();
        var admin = new User
        {
            Name = "Integration Admin",
            Email = AdminEmail,
            Role = "Admin",
            IsEmailConfirmed = true
        };

        admin.PasswordHash = new PasswordHasher<User>().HashPassword(admin, AdminPassword);
        context.Users.Add(admin);
        await context.SaveChangesAsync();
    }

    private async Task<string> GetConnectionStringAsync()
    {
        var configuredConnectionString = Environment.GetEnvironmentVariable(ConnectionStringVariable);

        if (!string.IsNullOrWhiteSpace(configuredConnectionString))
        {
            return configuredConnectionString;
        }

        _container = new MsSqlBuilder("mcr.microsoft.com/mssql/server:2022-latest").Build();
        await _container.StartAsync();

        return new SqlConnectionStringBuilder(_container.GetConnectionString())
        {
            InitialCatalog = DatabaseName
        }.ConnectionString;
    }

    // Respawn deletes every row, so never run against a database that could hold real data.
    private static void EnsureDisposableDatabase(string connectionString)
    {
        var databaseName = new SqlConnectionStringBuilder(connectionString).InitialCatalog;

        if (!databaseName.EndsWith(RequiredDatabaseSuffix, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException(
                $"Integration tests delete all data. The database name must end with " +
                $"'{RequiredDatabaseSuffix}', but was '{databaseName}'.");
        }
    }
}

public sealed class ApiFactory : WebApplicationFactory<Program>
{
    public const string JwtKey = "integration-test-jwt-key-that-is-long-enough-for-hmac";
    public const string JwtIssuerAndAudience = "ResourceReservation.IntegrationTests";

    private readonly string _connectionString;
    private readonly IReadOnlyDictionary<string, string> _settingOverrides;

    public ApiFactory(
        string connectionString,
        IReadOnlyDictionary<string, string>? settingOverrides = null)
    {
        _connectionString = connectionString;
        _settingOverrides = settingOverrides ?? new Dictionary<string, string>();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        // UseSetting is visible while Program.cs reads configuration before Build().
        builder.UseEnvironment("Testing");
        builder.UseSetting("ConnectionStrings:DefaultConnection", _connectionString);
        builder.UseSetting("Jwt:Key", JwtKey);
        builder.UseSetting("Jwt:Issuer", JwtIssuerAndAudience);
        builder.UseSetting("Jwt:Audience", JwtIssuerAndAudience);
        builder.UseSetting("Scheduling:TimeZoneId", "Europe/Copenhagen");
        // Tests log in many times from one address. RateLimitingTests set a real limit.
        builder.UseSetting("RateLimiting:Auth:PermitLimit", "10000");
        // Test bookings are dated 2030, beyond the default 90-day booking horizon.
        // BookingPolicyTests check the horizon with dates relative to today.
        builder.UseSetting("BookingPolicy:MaxAdvanceDays", "3650");
        builder.UseSetting("RateLimiting:Email:PermitLimit", "10000");
        builder.UseSetting("Email:Delivery", "PickupDirectory");
        builder.UseSetting("Email:PickupDirectory", Path.Combine(Path.GetTempPath(), "rr-integration-emails"));
        builder.UseSetting("Email:FromAddress", "no-reply@integration.test");
        builder.UseSetting("Frontend:BaseUrl", "https://app.integration.test");
        builder.UseSetting("EmailOutbox:PollIntervalMilliseconds", "100");
        // Every host's worker may pick up any email, so all retry quickly.
        builder.UseSetting("EmailOutbox:MaxAttempts", "3");
        builder.UseSetting("EmailOutbox:FirstRetryDelaySeconds", "1");

        foreach (var (key, value) in _settingOverrides)
        {
            builder.UseSetting(key, value);
        }

        builder.ConfigureServices(services =>
            services.AddSingleton<IStartupFilter, TestRemoteIpStartupFilter>());
        // Emails are caught, never written or sent.
        builder.ConfigureTestServices(services =>
            services.AddSingleton<IEmailSender>(TestEmailSink.Instance));
    }
}

// The in-memory test server has no client IP address. A test sets one with the
// X-Test-Remote-Ip header, as if the request came from that address.
public sealed class TestRemoteIpStartupFilter : IStartupFilter
{
    public const string HeaderName = "X-Test-Remote-Ip";

    public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next)
    {
        return app =>
        {
            app.Use(async (context, nextMiddleware) =>
            {
                if (context.Request.Headers.Remove(HeaderName, out var remoteIp))
                {
                    context.Connection.RemoteIpAddress = IPAddress.Parse(remoteIp.ToString());
                }

                await nextMiddleware(context);
            });

            next(app);
        };
    }
}

[CollectionDefinition(Name)]
public sealed class ApiCollection : ICollectionFixture<ApiFixture>
{
    public const string Name = "Api";
}
