using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using ResourceReservation.Api.Configuration;
using ResourceReservation.Api.Data;
using ResourceReservation.Api.IntegrationTests.Infrastructure;
using ResourceReservation.Api.Models;
using ResourceReservation.Api.Services;

namespace ResourceReservation.Api.IntegrationTests;

// The clean-up of data that is no longer needed (ADR 0013), against SQL
// Server, whose cascades remove an account's throwaway rows with it. The test
// host's worker is off; these tests run the clean-up directly.
public class DataRetentionTests : ApiTestBase
{
    private static readonly DateTimeOffset Now = DateTimeOffset.UtcNow;

    public DataRetentionTests(ApiFixture fixture)
        : base(fixture)
    {
    }

    [Fact]
    public async Task BookingEmails_AreDeletedOnlyAfterTheirPeriod()
    {
        var reservationId = await SeedReservationAsync(await SeedUserAsync("owner@integration.test", confirmed: true));
        await SeedNotificationsAsync(
            reservationId,
            Notification(sentAt: Now.AddDays(-31)),
            Notification(sentAt: Now.AddDays(-29)),
            Notification(failedAt: Now.AddDays(-91)),
            // Failed emails are kept longer than sent ones.
            Notification(failedAt: Now.AddDays(-60)),
            // Not sent yet: never deleted, however old.
            Notification(createdAt: Now.AddDays(-400)));

        var result = await RunAsync();

        Assert.Equal((1, 1), (result.SentBookingEmails, result.FailedBookingEmails));
        await using var context = Fixture.CreateDbContext();
        var left = await context.BookingNotifications.OrderBy(notification => notification.Id).ToListAsync();
        Assert.Equal(3, left.Count);
        Assert.Contains(left, notification => notification.SentAt > Now.AddDays(-30));
        Assert.Contains(left, notification => notification.FailedAt > Now.AddDays(-90));
        Assert.Contains(left, notification => notification.SentAt == null && notification.FailedAt == null);
        Assert.True(await context.Reservations.AnyAsync(reservation => reservation.Id == reservationId));
    }

    [Fact]
    public async Task Sessions_AreDeletedAWeekAfterTheyExpire()
    {
        var userId = await SeedUserAsync("sessions@integration.test", confirmed: true);
        await using (var context = Fixture.CreateDbContext())
        {
            context.UserSessions.AddRange(
                Session(userId, expiresAt: Now.AddDays(-8)),
                Session(userId, expiresAt: Now.AddDays(-6)),
                // Revoked but not yet expired.
                Session(userId, expiresAt: Now.AddHours(1), revokedAt: Now.AddDays(-30)),
                Session(userId, expiresAt: Now.AddHours(1)));
            await context.SaveChangesAsync();
        }

        var result = await RunAsync();

        Assert.Equal(1, result.Sessions);
        await using var check = Fixture.CreateDbContext();
        Assert.Equal(3, await check.UserSessions.CountAsync());
        Assert.False(await check.UserSessions.AnyAsync(session => session.ExpiresAt < Now.AddDays(-7)));
    }

    [Fact]
    public async Task LinkTokens_AreDeletedAWeekAfterTheyWereUsedOrExpired()
    {
        var userId = await SeedUserAsync("links@integration.test", confirmed: true);
        await SeedTokensAsync(
            Token(userId, expiresAt: Now.AddDays(-8)),
            Token(userId, expiresAt: Now.AddDays(1), usedAt: Now.AddDays(-8)),
            Token(userId, expiresAt: Now.AddDays(-6)),
            Token(userId, expiresAt: Now.AddDays(1), usedAt: Now.AddDays(-1)),
            Token(userId, expiresAt: Now.AddDays(1)));

        var result = await RunAsync();

        Assert.Equal(2, result.LinkTokens);
        await using var context = Fixture.CreateDbContext();
        Assert.Equal(3, await context.UserTokens.CountAsync());
    }

    [Fact]
    public async Task AnOldUnconfirmedAccount_IsDeletedWithItsThrowawayRows()
    {
        var userId = await SeedUserAsync("abandoned@integration.test", createdAt: Now.AddDays(-8));
        await SeedTokensAsync(Token(userId, expiresAt: Now.AddDays(-7)));
        await using (var context = Fixture.CreateDbContext())
        {
            context.AccountEmailCooldowns.Add(new AccountEmailCooldown
            {
                UserId = userId,
                Purpose = AccountEmailPurposes.EmailVerification,
                LastSentAt = Now.AddDays(-8)
            });
            context.UserSessions.Add(Session(userId, expiresAt: Now.AddDays(-1)));
            await context.SaveChangesAsync();
        }

        var result = await RunAsync();

        Assert.Equal(1, result.UnconfirmedAccounts);
        await using var check = Fixture.CreateDbContext();
        Assert.False(await check.Users.AnyAsync(user => user.Id == userId));
        Assert.False(await check.UserTokens.AnyAsync(token => token.UserId == userId));
        Assert.False(await check.AccountEmailCooldowns.AnyAsync(cooldown => cooldown.UserId == userId));
        Assert.False(await check.UserSessions.AnyAsync(session => session.UserId == userId));
    }

    // Everything that refers to an account and matters keeps it, and so does
    // anything that says it may still be wanted.
    [Fact]
    public async Task UnconfirmedAccounts_ThatAnythingImportantRefersTo_AreKept()
    {
        var old = Now.AddDays(-30);
        var owner = await SeedUserAsync("owns-a-booking@integration.test", createdAt: old);
        var canceller = await SeedUserAsync("cancelled-a-booking@integration.test", createdAt: old);
        var closureAuthor = await SeedUserAsync("created-a-closure@integration.test", createdAt: old);
        var deactivated = await SeedUserAsync("deactivated@integration.test", createdAt: old, isActive: false);
        var withLiveLink = await SeedUserAsync("live-link@integration.test", createdAt: old);
        var recent = await SeedUserAsync("recent@integration.test", createdAt: Now.AddDays(-3));
        var admin = await SeedUserAsync("unconfirmed-admin@integration.test", createdAt: old, role: UserRoles.Admin);
        var confirmed = await SeedUserAsync("confirmed@integration.test", createdAt: old, confirmed: true);
        var noCreationTime = await SeedUserAsync("no-created-at@integration.test", createdAt: null);
        var abandoned = await SeedUserAsync("abandoned@integration.test", createdAt: old);

        var bookingOwner = await SeedUserAsync("booking-owner@integration.test", confirmed: true);
        await SeedReservationAsync(owner);
        await SeedReservationAsync(bookingOwner, cancelledBy: canceller, hour: 11);
        await SeedClosureAsync(closureAuthor);
        await SeedTokensAsync(Token(withLiveLink, expiresAt: Now.AddHours(2)));

        var result = await RunAsync();

        Assert.Equal(1, result.UnconfirmedAccounts);
        await using var context = Fixture.CreateDbContext();
        var remaining = await context.Users.Select(user => user.Id).ToListAsync();
        Assert.DoesNotContain(abandoned, remaining);
        Assert.All(
            [owner, canceller, closureAuthor, deactivated, withLiveLink, recent, admin, confirmed, noCreationTime],
            userId => Assert.Contains(userId, remaining));
    }

    [Fact]
    public async Task LargeCleanUps_RunInBatchesUntilNothingIsLeft()
    {
        var reservationId = await SeedReservationAsync(await SeedUserAsync("owner@integration.test", confirmed: true));
        await SeedNotificationsAsync(
            reservationId,
            Enumerable.Range(0, 250).Select(_ => Notification(sentAt: Now.AddDays(-40))).ToArray());

        var result = await RunAsync(new RetentionOptions { BatchSize = 100 });

        Assert.Equal(250, result.SentBookingEmails);
        await using var context = Fixture.CreateDbContext();
        Assert.False(await context.BookingNotifications.AnyAsync());
    }

    [Fact]
    public async Task ASecondRun_FindsNothingMore()
    {
        await SeedUserAsync("abandoned@integration.test", createdAt: Now.AddDays(-8));

        Assert.Equal(1, (await RunAsync()).Total);
        Assert.Equal(0, (await RunAsync()).Total);
    }

    // The account clean-up must know every table that refers to Users. A new
    // reference fails this test until the clean-up is checked for it.
    [Fact]
    public void EveryForeignKeyToUsers_IsKnownToTheAccountCleanUp()
    {
        using var context = Fixture.CreateDbContext();

        var foreignKeys = context.Model.FindEntityType(typeof(User))!
            .GetReferencingForeignKeys()
            .Select(key => $"{key.DeclaringEntityType.ClrType.Name}.{key.Properties.Single().Name} {key.DeleteBehavior}")
            .Order()
            .ToList();

        Assert.Equal(
            [
                // Throwaway, deleted with the account.
                "AccountEmailCooldown.UserId Cascade",
                // Important: an account they refer to is kept.
                "AvailabilityException.CreatedByUserId Restrict",
                "Reservation.CancelledByUserId Restrict",
                "Reservation.UserId Restrict",
                // Throwaway, deleted with the account.
                "UserSession.UserId Cascade",
                "UserToken.UserId Cascade"
            ],
            foreignKeys);
    }

    private async Task<RetentionResult> RunAsync(RetentionOptions? options = null)
    {
        await using var context = Fixture.CreateDbContext();
        var retention = new DataRetention(context, TimeProvider.System, Options.Create(options ?? new RetentionOptions()));

        return await retention.RunAsync(CancellationToken.None);
    }

    private async Task<int> SeedUserAsync(
        string email,
        DateTimeOffset? createdAt = null,
        bool confirmed = false,
        bool isActive = true,
        string role = UserRoles.User)
    {
        await using var context = Fixture.CreateDbContext();
        var user = new User
        {
            Name = "Retention User",
            Email = email,
            Role = role,
            IsActive = isActive,
            IsEmailConfirmed = confirmed,
            CreatedAt = createdAt
        };
        user.PasswordHash = new PasswordHasher<User>().HashPassword(user, "Password123");
        context.Users.Add(user);
        await context.SaveChangesAsync();

        return user.Id;
    }

    private async Task<int> SeedResourceAsync(AppDbContext context)
    {
        var resource = new Resource { Name = $"Retention Room {Guid.NewGuid():N}" };
        context.Resources.Add(resource);
        await context.SaveChangesAsync();

        return resource.Id;
    }

    private async Task<int> SeedReservationAsync(int userId, int? cancelledBy = null, int hour = 9)
    {
        await using var context = Fixture.CreateDbContext();
        var reservation = new Reservation
        {
            ResourceId = await SeedResourceAsync(context),
            UserId = userId,
            StartTime = BookingDay.AddHours(hour),
            EndTime = BookingDay.AddHours(hour + 1),
            Status = cancelledBy is null ? ReservationStatuses.Active : ReservationStatuses.Cancelled,
            CancelledByUserId = cancelledBy,
            CancelledAt = cancelledBy is null ? null : Now
        };
        context.Reservations.Add(reservation);
        await context.SaveChangesAsync();

        return reservation.Id;
    }

    private async Task SeedClosureAsync(int createdBy)
    {
        await using var context = Fixture.CreateDbContext();
        context.AvailabilityExceptions.Add(new AvailabilityException
        {
            ResourceId = await SeedResourceAsync(context),
            StartTime = BookingDay,
            EndTime = BookingDay.AddDays(1),
            Reason = "Maintenance",
            CreatedAt = Now,
            CreatedByUserId = createdBy
        });
        await context.SaveChangesAsync();
    }

    private async Task SeedNotificationsAsync(int reservationId, params BookingNotification[] notifications)
    {
        await using var context = Fixture.CreateDbContext();

        foreach (var notification in notifications)
        {
            notification.ReservationId = reservationId;
        }

        context.BookingNotifications.AddRange(notifications);
        await context.SaveChangesAsync();
    }

    private async Task SeedTokensAsync(params UserToken[] tokens)
    {
        await using var context = Fixture.CreateDbContext();
        context.UserTokens.AddRange(tokens);
        await context.SaveChangesAsync();
    }

    private static BookingNotification Notification(
        DateTimeOffset? sentAt = null,
        DateTimeOffset? failedAt = null,
        DateTimeOffset? createdAt = null)
    {
        return new BookingNotification
        {
            Kind = BookingNotificationKinds.Created,
            StartTime = BookingDay.AddHours(9),
            EndTime = BookingDay.AddHours(10),
            ResourceName = "Retention Room",
            RecipientName = "Owner",
            RecipientEmail = "owner@integration.test",
            CreatedAt = createdAt ?? sentAt ?? failedAt ?? Now,
            NextAttemptAt = Now,
            SentAt = sentAt,
            FailedAt = failedAt
        };
    }

    private static UserSession Session(int userId, DateTimeOffset expiresAt, DateTimeOffset? revokedAt = null)
    {
        return new UserSession
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Client = UserSessionClients.Browser,
            CreatedAt = expiresAt.AddHours(-2),
            ExpiresAt = expiresAt,
            RevokedAt = revokedAt
        };
    }

    private static UserToken Token(int userId, DateTimeOffset expiresAt, DateTimeOffset? usedAt = null)
    {
        return new UserToken
        {
            UserId = userId,
            Purpose = UserTokenPurposes.EmailVerification,
            TokenHash = Convert.ToHexString(Guid.NewGuid().ToByteArray()) + Convert.ToHexString(Guid.NewGuid().ToByteArray()),
            CreatedAt = expiresAt.AddDays(-1),
            ExpiresAt = expiresAt,
            UsedAt = usedAt
        };
    }
}
