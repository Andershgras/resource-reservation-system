using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace ResourceReservation.Api.Data;

// Used by the dotnet ef tools and migration bundles instead of starting the API,
// so applying migrations never depends on the API's startup code or settings.
//
// The connection string comes from ConnectionStrings:DefaultConnection in
// appsettings.json, appsettings.{ASPNETCORE_ENVIRONMENT}.json (Development by
// default, for local use) or environment variables. A migration bundle's
// --connection option overrides it.
public class AppDbContextDesignTimeFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args)
    {
        var environment = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Development";
        var configuration = new ConfigurationBuilder()
            .SetBasePath(Directory.GetCurrentDirectory())
            .AddJsonFile("appsettings.json", optional: true)
            .AddJsonFile($"appsettings.{environment}.json", optional: true)
            .AddEnvironmentVariables()
            .Build();
        var connectionString = configuration.GetConnectionString("DefaultConnection");
        var options = new DbContextOptionsBuilder<AppDbContext>();

        // Without a connection string here, one must be given with --connection.
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            options.UseSqlServer();
        }
        else
        {
            options.UseSqlServer(connectionString);
        }

        return new AppDbContext(options.Options);
    }
}
