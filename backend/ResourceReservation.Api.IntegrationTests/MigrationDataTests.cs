using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using ResourceReservation.Api.Data;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.IntegrationTests.Infrastructure;
using ResourceReservation.Api.Models;

namespace ResourceReservation.Api.IntegrationTests;

// Upgrades a database that holds data from before Milestone 6, and checks that
// nothing is lost. Uses its own database, so the shared test database is untouched.
public class MigrationDataTests : ApiTestBase
{
    private const string LastMigrationBeforeMilestone6 = "20261012160125_HardenSchema";
    private const string LastMigrationBeforeAccountSecurity = "20261013224055_AddAvailabilityExceptions";

    public MigrationDataTests(ApiFixture fixture)
        : base(fixture)
    {
    }

    [Fact]
    public async Task Milestone6Migrations_KeepExistingDataAndLeaveUnknownValuesEmpty()
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
                Assert.Equal(0, reservation.CalendarSequence);
            });

            var resource = await context.Resources.AsNoTracking().SingleAsync();
            Assert.Equal(("Legacy Room", "Kept", "Floor 1", true),
                (resource.Name, resource.Description, resource.Location, resource.IsActive));
            // No overrides, so the resource follows the default booking rules.
            Assert.Equal((null, null, null, null),
                (resource.MinDurationMinutes, resource.MaxDurationMinutes,
                    resource.MinLeadTimeMinutes, resource.MaxAdvanceDays));
            Assert.Equal("legacy@example.com", (await context.Users.AsNoTracking().SingleAsync()).Email);
            Assert.Empty(await context.AvailabilityExceptions.AsNoTracking().ToListAsync());
        }
        finally
        {
            await context.Database.EnsureDeletedAsync();
        }
    }

    // Users from before account security and email verification existed stay
    // active and confirmed, each get their own stamp, and can still sign in and
    // use their token afterwards.
    [Fact]
    public async Task AccountSecurityMigration_KeepsExistingUsersActiveAndAbleToSignIn()
    {
        var connectionString = new SqlConnectionStringBuilder(Fixture.ConnectionString)
        {
            InitialCatalog = "ResourceReservation_UserMigration_IntegrationTests"
        }.ConnectionString;
        await using var context = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlServer(connectionString)
            .Options);
        await context.Database.EnsureDeletedAsync();

        try
        {
            await context.GetService<IMigrator>().MigrateAsync(LastMigrationBeforeAccountSecurity);
            var hasher = new PasswordHasher<User>();
            await context.Database.ExecuteSqlInterpolatedAsync(
                $"""
                INSERT INTO [Users] ([Name], [Email], [PasswordHash], [Role])
                VALUES
                    ('Legacy Admin', 'legacy-admin@example.com', {hasher.HashPassword(new User(), "LegacyAdmin123")}, 'Admin'),
                    ('Legacy User', 'legacy-user@example.com', {hasher.HashPassword(new User(), "LegacyUser123")}, 'User');
                """);

            await context.Database.MigrateAsync();

            var users = await context.Users.AsNoTracking().OrderBy(user => user.Id).ToListAsync();
            Assert.Equal(
                [("legacy-admin@example.com", "Admin"), ("legacy-user@example.com", "User")],
                users.Select(user => (user.Email, user.Role)));
            Assert.All(users, user =>
            {
                Assert.True(user.IsActive);
                Assert.Matches("^[0-9A-F]{64}$", user.SecurityStamp);
                Assert.Null(user.CreatedAt);
                Assert.Equal(0, user.FailedLoginCount);
                Assert.Null(user.LockoutEndsAt);
                Assert.True(user.IsEmailConfirmed);
                // Unknown, so left empty rather than invented.
                Assert.Null(user.EmailConfirmedAt);
            });
            Assert.NotEqual(users[0].SecurityStamp, users[1].SecurityStamp);

            await using var factory = new ApiFactory(connectionString);
            var adminClient = await SignInAsync(factory, "legacy-admin@example.com", "LegacyAdmin123");
            var userClient = await SignInAsync(factory, "legacy-user@example.com", "LegacyUser123");
            Assert.Equal(HttpStatusCode.OK, (await adminClient.GetAsync("/api/users")).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await userClient.GetAsync("/api/reservations/me")).StatusCode);
        }
        finally
        {
            await context.Database.EnsureDeletedAsync();
        }
    }

    private static async Task<HttpClient> SignInAsync(ApiFactory factory, string email, string password)
    {
        var client = factory.CreateBrowserClient();
        var response = await client.PostAsJsonAsync("/api/auth/token", new LoginUserDto
        {
            Email = email,
            Password = password
        });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var auth = await response.Content.ReadFromJsonAsync<AuthResponseDto>();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth!.Token);

        return client;
    }
}
