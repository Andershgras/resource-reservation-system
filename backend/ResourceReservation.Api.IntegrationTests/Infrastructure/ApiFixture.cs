using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using ResourceReservation.Api.Data;
using ResourceReservation.Api.Models;
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
            Role = "Admin"
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
    private readonly string _connectionString;

    public ApiFactory(string connectionString)
    {
        _connectionString = connectionString;
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        // UseSetting is visible while Program.cs reads configuration before Build().
        builder.UseEnvironment("Testing");
        builder.UseSetting("ConnectionStrings:DefaultConnection", _connectionString);
        builder.UseSetting("Jwt:Key", "integration-test-jwt-key-that-is-long-enough-for-hmac");
        builder.UseSetting("Jwt:Issuer", "ResourceReservation.IntegrationTests");
        builder.UseSetting("Jwt:Audience", "ResourceReservation.IntegrationTests");
        builder.UseSetting("Scheduling:TimeZoneId", "Europe/Copenhagen");
    }
}

[CollectionDefinition(Name)]
public sealed class ApiCollection : ICollectionFixture<ApiFixture>
{
    public const string Name = "Api";
}
