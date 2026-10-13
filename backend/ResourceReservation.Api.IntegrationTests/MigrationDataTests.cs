using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using ResourceReservation.Api.Data;
using ResourceReservation.Api.IntegrationTests.Infrastructure;
using ResourceReservation.Api.Models;

namespace ResourceReservation.Api.IntegrationTests;

// Upgrades a database that holds data from before Milestone 6, and checks that
// nothing is lost. Uses its own database, so the shared test database is untouched.
public class MigrationDataTests : ApiTestBase
{
    private const string LastMigrationBeforeMilestone6 = "20261012160125_HardenSchema";

    public MigrationDataTests(ApiFixture fixture)
        : base(fixture)
    {
    }

    [Fact]
    public async Task Milestone6Migrations_KeepExistingReservationsAndLeaveUnknownAuditTimesEmpty()
    {
        var connectionString = new SqlConnectionStringBuilder(Fixture.ConnectionString)
        {
            InitialCatalog = "ResourceReservation_Migrations_IntegrationTests"
        }.ConnectionString;
        await using var context = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlServer(connectionString)
            .Options);
        await context.Database.EnsureDeletedAsync();

        try
        {
            await context.GetService<IMigrator>().MigrateAsync(LastMigrationBeforeMilestone6);
            await context.Database.ExecuteSqlRawAsync(
                """
                INSERT INTO [Users] ([Name], [Email], [PasswordHash], [Role])
                VALUES ('Legacy User', 'legacy@example.com', 'hash', 'User');
                INSERT INTO [Resources] ([Name], [Description], [Location], [IsActive])
                VALUES ('Legacy Room', 'Kept', 'Floor 1', 1);
                INSERT INTO [Reservations] ([ResourceId], [UserId], [StartTime], [EndTime], [Status])
                VALUES
                    (1, 1, '2030-01-16T09:00:00', '2030-01-16T19:00:00', 'Active'),
                    (1, 1, '2030-01-17T09:00:00', '2030-01-17T10:00:00', 'Cancelled');
                """);

            await context.Database.MigrateAsync();

            var reservations = await context.Reservations
                .AsNoTracking()
                .OrderBy(reservation => reservation.Id)
                .ToListAsync();
            Assert.Equal(
                [
                    (new DateTime(2030, 1, 16, 9, 0, 0), new DateTime(2030, 1, 16, 19, 0, 0), ReservationStatuses.Active),
                    (new DateTime(2030, 1, 17, 9, 0, 0), new DateTime(2030, 1, 17, 10, 0, 0), ReservationStatuses.Cancelled)
                ],
                reservations.Select(reservation => (reservation.StartTime, reservation.EndTime, reservation.Status)));
            Assert.All(reservations, reservation =>
            {
                Assert.Null(reservation.CreatedAt);
                Assert.Null(reservation.UpdatedAt);
                Assert.Null(reservation.CancelledAt);
                Assert.Null(reservation.CancelledByUserId);
                Assert.NotEmpty(reservation.Version);
            });

            var resource = await context.Resources.AsNoTracking().SingleAsync();
            Assert.Equal(("Legacy Room", "Kept", "Floor 1", true),
                (resource.Name, resource.Description, resource.Location, resource.IsActive));
            Assert.Equal("legacy@example.com", (await context.Users.AsNoTracking().SingleAsync()).Email);
        }
        finally
        {
            await context.Database.EnsureDeletedAsync();
        }
    }
}
