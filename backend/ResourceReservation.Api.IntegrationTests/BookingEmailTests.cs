using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.IntegrationTests.Infrastructure;
using ResourceReservation.Api.Models;
using ResourceReservation.Api.Services;

namespace ResourceReservation.Api.IntegrationTests;

// Booking emails through the outbox: saved with the booking, sent by the
// worker, retried, and never able to undo a booking (ADR 0011).
public class BookingEmailTests : ApiTestBase
{
    private const string UserEmail = "user@integration.test";

    public BookingEmailTests(ApiFixture fixture)
        : base(fixture)
    {
    }

    [Fact]
    public async Task MakingMovingAndCancelling_SendsInvitationsThatUpdateOneCalendarEvent()
    {
        var (_, resourceId, userClient) = await SetUpAsync();

        var booking = await BookAsync(userClient, resourceId, 9, 10);
        var created = await WaitForEmailAsync("Booking confirmed");
        var moved = await userClient.PutAsJsonAsync($"/api/reservations/{booking.Id}", new RescheduleReservationDto
        {
            StartTime = BookingDay.AddHours(11),
            EndTime = BookingDay.AddHours(12),
            Version = booking.Version
        });
        var movedEmail = await WaitForEmailAsync("Booking moved");
        var movedBooking = await moved.Content.ReadFromJsonAsync<ReservationResponseDto>();
        var cancel = await userClient.PutAsJsonAsync($"/api/reservations/{booking.Id}/cancel",
            new CancelReservationDto { Version = movedBooking!.Version });
        var cancelledEmail = await WaitForEmailAsync("Booking cancelled");

        Assert.Equal(HttpStatusCode.NoContent, cancel.StatusCode);
        Assert.Equal("Booking confirmed: Integration Room, Wed 16 Jan 2030, 09:00–10:00", created.Subject);
        Assert.Contains("When: Wed 16 Jan 2030, 09:00–10:00 (Copenhagen time)", created.TextBody);
        var uid = $"UID:reservation-{booking.Id}@integration.test";
        var invites = new[] { created, movedEmail, cancelledEmail }.Select(email => Assert.Single(email.Attachments)).ToList();
        Assert.All(invites, invite => Assert.Contains(uid, invite.Content));
        Assert.Equal(
            ["text/calendar; method=REQUEST; charset=UTF-8", "text/calendar; method=REQUEST; charset=UTF-8", "text/calendar; method=CANCEL; charset=UTF-8"],
            invites.Select(invite => invite.ContentType));
        Assert.Contains("SEQUENCE:0\r\n", invites[0].Content);
        Assert.Contains("SEQUENCE:1\r\n", invites[1].Content);
        Assert.Contains("SEQUENCE:2\r\n", invites[2].Content);
        // 09:00 in Copenhagen in January is 08:00 UTC.
        Assert.Contains("DTSTART:20300116T080000Z\r\n", invites[0].Content);
        Assert.Contains("DTSTART:20300116T100000Z\r\n", invites[1].Content);
        Assert.Contains("METHOD:CANCEL\r\n", invites[2].Content);
        Assert.Contains("STATUS:CANCELLED\r\n", invites[2].Content);
        Assert.Equal(3, TestEmailSink.Instance.Messages.Select(message => message.MessageId).Distinct().Count());
    }

    [Fact]
    public async Task AnAdminsChange_SaysAnAdminMadeIt()
    {
        var (adminClient, resourceId, userClient) = await SetUpAsync();
        var booking = await BookAsync(userClient, resourceId, 9, 10);
        await WaitForEmailAsync("Booking confirmed");

        await adminClient.PutAsJsonAsync($"/api/reservations/{booking.Id}/cancel", new CancelReservationDto());

        Assert.Contains("An administrator cancelled your booking.", (await WaitForEmailAsync("Booking cancelled")).TextBody);
    }

    // The email can't be sent, but the booking stands. The outbox keeps
    // trying, then gives up and records why.
    [Fact]
    public async Task ASendingFailure_NeverUndoesTheBooking_AndIsRetriedThenRecorded()
    {
        var (_, resourceId, userClient) = await SetUpAsync();
        TestEmailSink.Instance.FailWith = _ => new InvalidOperationException("Mail server unavailable");

        var response = await userClient.PostAsJsonAsync("/api/reservations", Booking(resourceId, 9, 10));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        // The test hosts allow 3 attempts, 1 s then 4 s apart.
        var notification = await WaitForNotificationAsync(stored => stored.FailedAt != null);
        Assert.Equal(3, notification.Attempts);
        Assert.Null(notification.SentAt);
        Assert.Equal("InvalidOperationException: Mail server unavailable", notification.LastError);
        await using var context = Fixture.CreateDbContext();
        Assert.Equal(ReservationStatuses.Active, (await context.Reservations.SingleAsync()).Status);
        Assert.Empty(TestEmailSink.Instance.Messages);
    }

    [Fact]
    public async Task AFailedAttempt_IsRetriedAndThenSent()
    {
        var (_, resourceId, userClient) = await SetUpAsync();
        var failures = 0;
        TestEmailSink.Instance.FailWith = _ => Interlocked.Increment(ref failures) == 1
            ? new InvalidOperationException("Temporary failure")
            : null;

        await userClient.PostAsJsonAsync("/api/reservations", Booking(resourceId, 9, 10));

        var notification = await WaitForNotificationAsync(stored => stored.SentAt != null);
        Assert.Equal(2, notification.Attempts);
        Assert.Single(TestEmailSink.Instance.Messages);
    }

    // A booking that fails leaves nothing in the outbox.
    [Fact]
    public async Task ARefusedBooking_QueuesNoEmail()
    {
        var (_, resourceId, userClient) = await SetUpAsync();
        await BookAsync(userClient, resourceId, 9, 10);

        var clash = await userClient.PostAsJsonAsync("/api/reservations", Booking(resourceId, 9, 10));

        Assert.Equal(HttpStatusCode.Conflict, clash.StatusCode);
        await using var context = Fixture.CreateDbContext();
        Assert.Equal(1, await context.BookingNotifications.CountAsync());
    }

    // Several workers at once, as with several API instances, send each email
    // exactly once.
    [Fact]
    public async Task ConcurrentWorkers_SendEachEmailOnce()
    {
        var (_, resourceId, userClient) = await SetUpAsync();
        // A host whose own worker never runs, so only the processors below send.
        await using var factory = new ApiFactory(Fixture.ConnectionString, new Dictionary<string, string>
        {
            ["EmailOutbox:PollIntervalMilliseconds"] = "300000"
        });
        await using (var context = Fixture.CreateDbContext())
        {
            var reservation = new Reservation
            {
                ResourceId = resourceId,
                UserId = (await context.Users.SingleAsync(user => user.Email == UserEmail)).Id,
                StartTime = BookingDay.AddHours(9),
                EndTime = BookingDay.AddHours(10)
            };
            context.Reservations.Add(reservation);
            await context.SaveChangesAsync();
            // Due in the future, so the shared host's worker leaves them alone
            // until they are released below.
            var notBefore = DateTimeOffset.UtcNow.AddHours(1);
            context.BookingNotifications.AddRange(Enumerable.Range(0, 20).Select(_ => new BookingNotification
            {
                ReservationId = reservation.Id,
                Kind = BookingNotificationKinds.Created,
                StartTime = reservation.StartTime,
                EndTime = reservation.EndTime,
                ResourceName = "Integration Room",
                RecipientName = "Integration User",
                RecipientEmail = UserEmail,
                CreatedAt = DateTimeOffset.UtcNow,
                NextAttemptAt = notBefore
            }));
            await context.SaveChangesAsync();
            await context.BookingNotifications.ExecuteUpdateAsync(setters =>
                setters.SetProperty(notification => notification.NextAttemptAt, DateTimeOffset.UtcNow.AddSeconds(-1)));
        }

        var sent = await Task.WhenAll(Enumerable.Range(0, 4).Select(async _ =>
        {
            await using var scope = factory.Services.CreateAsyncScope();

            return await scope.ServiceProvider.GetRequiredService<EmailOutboxProcessor>().ProcessDueAsync(CancellationToken.None);
        }));

        await TestEmailSink.SettleAsync();
        var messageIds = TestEmailSink.Instance.Messages.Select(message => message.MessageId).ToList();
        Assert.Equal(20, messageIds.Count);
        Assert.Equal(20, messageIds.Distinct().Count());
        await using var check = Fixture.CreateDbContext();
        Assert.Equal(20, await check.BookingNotifications.CountAsync(notification => notification.SentAt != null));
    }

    [Fact]
    public async Task ADeactivatedUser_IsNotEmailed()
    {
        var (adminClient, resourceId, userClient) = await SetUpAsync();
        var booking = await BookAsync(userClient, resourceId, 9, 10);
        await WaitForEmailAsync("Booking confirmed");
        await using (var context = Fixture.CreateDbContext())
        {
            await context.Users.Where(user => user.Email == UserEmail)
                .ExecuteUpdateAsync(setters => setters.SetProperty(user => user.IsActive, false));
        }

        Assert.Equal(HttpStatusCode.NoContent, (await adminClient.PutAsJsonAsync(
            $"/api/reservations/{booking.Id}/cancel", new CancelReservationDto())).StatusCode);

        await TestEmailSink.SettleAsync();
        Assert.Single(TestEmailSink.Instance.Messages);
    }

    private async Task<(HttpClient Admin, int ResourceId, HttpClient User)> SetUpAsync()
    {
        var adminClient = await CreateAdminClientAsync();
        var resourceId = await CreateResourceWithWeeklyRuleAsync(adminClient, new TimeOnly(8, 0), new TimeOnly(16, 0));
        var userClient = await CreateUserClientAsync(UserEmail);
        TestEmailSink.Instance.Clear();

        return (adminClient, resourceId, userClient);
    }

    private static CreateReservationDto Booking(int resourceId, int startHour, int endHour)
    {
        return new CreateReservationDto
        {
            ResourceId = resourceId,
            StartTime = BookingDay.AddHours(startHour),
            EndTime = BookingDay.AddHours(endHour)
        };
    }

    private static async Task<ReservationResponseDto> BookAsync(HttpClient client, int resourceId, int startHour, int endHour)
    {
        var response = await client.PostAsJsonAsync("/api/reservations", Booking(resourceId, startHour, endHour));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        return (await response.Content.ReadFromJsonAsync<ReservationResponseDto>())!;
    }

    private static async Task<EmailMessage> WaitForEmailAsync(string subjectStart)
    {
        return Assert.Single(await TestEmailSink.Instance.WaitForAsync(
            UserEmail,
            message => message.Subject.StartsWith(subjectStart, StringComparison.Ordinal)));
    }

    private async Task<BookingNotification> WaitForNotificationAsync(Func<BookingNotification, bool> done)
    {
        for (var attempt = 0; attempt < 100; attempt++)
        {
            await using var context = Fixture.CreateDbContext();
            var notification = await context.BookingNotifications.AsNoTracking().SingleAsync();

            if (done(notification))
            {
                return notification;
            }

            await Task.Delay(100);
        }

        throw new TimeoutException("The booking email never reached the expected state.");
    }
}
