using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.IntegrationTests.Infrastructure;
using ResourceReservation.Api.Models;
using ResourceReservation.Api.Services;

namespace ResourceReservation.Api.IntegrationTests;

public class ClosureTests : ApiTestBase
{
    public ClosureTests(ApiFixture fixture)
        : base(fixture)
    {
    }

    [Fact]
    public async Task Closure_BlocksBookingAndMoving_AndShowsInTheSchedule()
    {
        var (adminClient, resourceId, userClient) = await SetUpAsync();
        var reservation = await BookAsync(userClient, resourceId, 8, 9);

        var create = await adminClient.PostAsJsonAsync("/api/availabilityexceptions", Closure(resourceId, 10, 12, "Repairs"));

        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        await ProblemAssert.IsProblemAsync(
            await userClient.PostAsJsonAsync("/api/reservations", Booking(resourceId, 11, 12)),
            HttpStatusCode.BadRequest,
            "Resource is not available in this time period.");
        await ProblemAssert.IsProblemAsync(
            await userClient.PutAsJsonAsync($"/api/reservations/{reservation.Id}", new RescheduleReservationDto
            {
                StartTime = BookingDay.AddHours(10),
                EndTime = BookingDay.AddHours(11),
                Version = reservation.Version
            }),
            HttpStatusCode.BadRequest,
            "Resource is not available in this time period.");
        var schedule = await CreateAnonymousClient().GetFromJsonAsync<ResourceScheduleResponseDto>(ScheduleUrl(resourceId));
        var closed = Assert.Single(schedule!.ClosedSlots);
        Assert.Equal((BookingDay.AddHours(10), BookingDay.AddHours(12), "Repairs"),
            (closed.StartTime, closed.EndTime, Assert.Single(closed.Reasons)));
        Assert.DoesNotContain(schedule.BookableSlots, slot =>
            slot.StartTime < BookingDay.AddHours(12) && slot.EndTime > BookingDay.AddHours(10));
    }

    [Fact]
    public async Task PreviewAndCreate_ListAffectedReservationsWithoutCancellingThem()
    {
        var (adminClient, resourceId, userClient) = await SetUpAsync();
        var reservation = await BookAsync(userClient, resourceId, 10, 11);

        var preview = await adminClient.PostAsJsonAsync("/api/availabilityexceptions/preview", Closure(resourceId, 9, 12));
        var create = await adminClient.PostAsJsonAsync("/api/availabilityexceptions", Closure(resourceId, 9, 12));

        var previewed = Assert.Single((await preview.Content.ReadFromJsonAsync<List<ReservationResponseDto>>())!);
        Assert.Equal((reservation.Id, "Integration User", "user@integration.test"),
            (previewed.Id, previewed.UserName, previewed.UserEmail));
        var created = await create.Content.ReadFromJsonAsync<AvailabilityExceptionCreatedDto>();
        Assert.Equal(reservation.Id, Assert.Single(created!.AffectedReservations).Id);
        Assert.Equal("Integration Admin", created.Closure.CreatedByName);
        var stillActive = await userClient.GetFromJsonAsync<ReservationResponseDto>($"/api/reservations/{reservation.Id}");
        Assert.Equal(ReservationStatuses.Active, stillActive!.Status);
    }

    [Fact]
    public async Task Create_ListsReservationsMadeAfterThePreview()
    {
        var (adminClient, resourceId, userClient) = await SetUpAsync();

        var preview = await adminClient.PostAsJsonAsync("/api/availabilityexceptions/preview", Closure(resourceId, 9, 12));
        var bookedMeanwhile = await BookAsync(userClient, resourceId, 10, 11);
        var create = await adminClient.PostAsJsonAsync("/api/availabilityexceptions", Closure(resourceId, 9, 12));

        Assert.Empty((await preview.Content.ReadFromJsonAsync<List<ReservationResponseDto>>())!);
        var created = await create.Content.ReadFromJsonAsync<AvailabilityExceptionCreatedDto>();
        Assert.Equal(bookedMeanwhile.Id, Assert.Single(created!.AffectedReservations).Id);
    }

    // The closure and the booking take the same resource lock. Whichever goes
    // second sees the first: a booking that succeeds is always listed as
    // affected, and one made after the closure is refused.
    [Fact]
    public async Task ParallelClosureAndBooking_NeverLeaveAnUnreportedBookingInsideTheClosure()
    {
        const int rounds = 8;
        var (adminClient, resourceId, userClient) = await SetUpAsync();

        for (var round = 0; round < rounds; round++)
        {
            // A different hour each round, so earlier rounds don't interfere.
            var hour = 8 + round;
            var responses = await Task.WhenAll(
                userClient.PostAsJsonAsync("/api/reservations", Booking(resourceId, hour, hour + 1)),
                adminClient.PostAsJsonAsync("/api/availabilityexceptions", Closure(resourceId, hour, hour + 1)));
            var (bookingResponse, closureResponse) = (responses[0], responses[1]);

            Assert.Equal(HttpStatusCode.Created, closureResponse.StatusCode);
            var created = await closureResponse.Content.ReadFromJsonAsync<AvailabilityExceptionCreatedDto>();

            if (bookingResponse.StatusCode == HttpStatusCode.Created)
            {
                var booking = await bookingResponse.Content.ReadFromJsonAsync<ReservationResponseDto>();
                Assert.Equal(booking!.Id, Assert.Single(created!.AffectedReservations).Id);
            }
            else
            {
                await ProblemAssert.IsProblemAsync(
                    bookingResponse,
                    HttpStatusCode.BadRequest,
                    "Resource is not available in this time period.");
                Assert.Empty(created!.AffectedReservations);
            }
        }
    }

    [Fact]
    public async Task CreateClosure_WaitsForTheResourcesBookingLock()
    {
        var (adminClient, resourceId, _) = await SetUpAsync();
        await using var shortTimeoutFactory = new ApiFactory(
            Fixture.ConnectionString,
            new Dictionary<string, string> { ["Scheduling:BookingLockTimeoutMilliseconds"] = "500" });
        var client = shortTimeoutFactory.CreateClient();
        client.DefaultRequestHeaders.Authorization = adminClient.DefaultRequestHeaders.Authorization;
        await using var heldLock = await HoldResourceLockAsync(resourceId);

        var busy = await client.PostAsJsonAsync("/api/availabilityexceptions", Closure(resourceId, 10, 12));

        await ProblemAssert.IsProblemAsync(busy, HttpStatusCode.ServiceUnavailable, ReservationService.ResourceBusyMessage);
        await heldLock.DisposeAsync();
        Assert.Equal(
            HttpStatusCode.Created,
            (await client.PostAsJsonAsync("/api/availabilityexceptions", Closure(resourceId, 10, 12))).StatusCode);
    }

    // A booking that was waiting for the lock while a closure was saved must
    // see the closure. Checking availability before taking the lock let it in.
    [Fact]
    public async Task Booking_ChecksAvailabilityAfterGettingTheLock()
    {
        var (_, resourceId, userClient) = await SetUpAsync();
        var heldLock = await HoldResourceLockAsync(resourceId);

        var booking = userClient.PostAsJsonAsync("/api/reservations", Booking(resourceId, 10, 11));
        await WaitForALockRequestAsync();
        await using (var context = Fixture.CreateDbContext())
        {
            context.AvailabilityExceptions.Add(new AvailabilityException
            {
                ResourceId = resourceId,
                StartTime = BookingDay.AddHours(9),
                EndTime = BookingDay.AddHours(12),
                Reason = "Saved while the booking waited",
                CreatedAt = DateTimeOffset.UtcNow
            });
            await context.SaveChangesAsync();
        }

        await heldLock.DisposeAsync();

        await ProblemAssert.IsProblemAsync(
            await booking,
            HttpStatusCode.BadRequest,
            "Resource is not available in this time period.");
    }

    [Fact]
    public async Task DeletingOneOfTwoOverlappingClosures_KeepsTheOtherAndItsReason()
    {
        var (adminClient, resourceId, _) = await SetUpAsync();
        var first = await adminClient.PostAsJsonAsync("/api/availabilityexceptions", Closure(resourceId, 10, 12, "Cleaning"));
        await adminClient.PostAsJsonAsync("/api/availabilityexceptions", Closure(resourceId, 11, 13, "Repairs"));
        var firstId = (await first.Content.ReadFromJsonAsync<AvailabilityExceptionCreatedDto>())!.Closure.Id;

        var both = await CreateAnonymousClient().GetFromJsonAsync<ResourceScheduleResponseDto>(ScheduleUrl(resourceId));
        var delete = await adminClient.DeleteAsync($"/api/availabilityexceptions/{firstId}");
        var after = await CreateAnonymousClient().GetFromJsonAsync<ResourceScheduleResponseDto>(ScheduleUrl(resourceId));

        Assert.Equal(["Cleaning", "Repairs"], Assert.Single(both!.ClosedSlots).Reasons);
        Assert.Equal(HttpStatusCode.NoContent, delete.StatusCode);
        var remaining = Assert.Single(after!.ClosedSlots);
        Assert.Equal((BookingDay.AddHours(11), BookingDay.AddHours(13), "Repairs"),
            (remaining.StartTime, remaining.EndTime, Assert.Single(remaining.Reasons)));
        var listed = await adminClient.GetFromJsonAsync<List<AvailabilityExceptionResponseDto>>(
            $"/api/availabilityexceptions?resourceId={resourceId}");
        Assert.Equal("Repairs", Assert.Single(listed!).Reason);
    }

    [Fact]
    public async Task PublicSchedule_NeverIncludesWhoBooked()
    {
        var (adminClient, resourceId, userClient) = await SetUpAsync();
        await BookAsync(userClient, resourceId, 8, 9);
        await adminClient.PostAsJsonAsync("/api/availabilityexceptions", Closure(resourceId, 10, 12, "Repairs"));

        foreach (var client in new[] { CreateAnonymousClient(), userClient, adminClient })
        {
            var json = await client.GetStringAsync(ScheduleUrl(resourceId));

            Assert.DoesNotContain("Integration User", json);
            Assert.DoesNotContain("Integration Admin", json);
            Assert.DoesNotContain("@integration.test", json);
            var schedule = JsonDocument.Parse(json).RootElement;
            Assert.Equal(["endTime", "startTime"],
                Assert.Single(schedule.GetProperty("reservedSlots").EnumerateArray())
                    .EnumerateObject().Select(property => property.Name).Order());
            Assert.Equal(["endTime", "reasons", "startTime"],
                Assert.Single(schedule.GetProperty("closedSlots").EnumerateArray())
                    .EnumerateObject().Select(property => property.Name).Order());
        }
    }

    [Fact]
    public async Task AdminReservationsForAResource_CanBeLimitedToAWeek()
    {
        var (adminClient, resourceId, userClient) = await SetUpAsync();
        var inWeek = await BookAsync(userClient, resourceId, 8, 9);
        await using (var context = Fixture.CreateDbContext())
        {
            // A booking in another week, added directly to skip the booking rules.
            var userId = (await context.Users.SingleAsync(user => user.Email == "user@integration.test")).Id;
            context.Reservations.Add(new Reservation
            {
                ResourceId = resourceId,
                UserId = userId,
                StartTime = BookingDay.AddDays(14).AddHours(8),
                EndTime = BookingDay.AddDays(14).AddHours(9)
            });
            await context.SaveChangesAsync();
        }

        var day = DateOnly.FromDateTime(BookingDay).ToString("yyyy-MM-dd");
        var week = await adminClient.GetFromJsonAsync<List<ReservationResponseDto>>(
            $"/api/reservations/resource/{resourceId}?from={day}&to={day}");
        var all = await adminClient.GetFromJsonAsync<List<ReservationResponseDto>>(
            $"/api/reservations/resource/{resourceId}");

        Assert.Equal(inWeek.Id, Assert.Single(week!).Id);
        Assert.Equal(2, all!.Count);
    }

    // Holds the resource's booking lock, as a slow booking would, until disposed.
    private async Task<SqlTransaction> HoldResourceLockAsync(int resourceId)
    {
        var connection = new SqlConnection(Fixture.ConnectionString);
        await connection.OpenAsync();
        var transaction = connection.BeginTransaction();
        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText =
            $"EXEC sp_getapplock @Resource = 'reservation:resource:{resourceId}', " +
            "@LockMode = 'Exclusive', @LockOwner = 'Transaction';";
        await command.ExecuteNonQueryAsync();

        return transaction;
    }

    // Until SQL Server shows a request waiting for an application lock.
    private async Task WaitForALockRequestAsync()
    {
        await using var connection = new SqlConnection(Fixture.ConnectionString);
        await connection.OpenAsync();

        for (var attempt = 0; attempt < 100; attempt++)
        {
            await using var command = connection.CreateCommand();
            command.CommandText =
                "SELECT COUNT(*) FROM sys.dm_tran_locks " +
                "WHERE resource_type = 'APPLICATION' AND request_status = 'WAIT'";

            if ((int)(await command.ExecuteScalarAsync())! > 0)
            {
                return;
            }

            await Task.Delay(50);
        }

        throw new TimeoutException("No request waited for the booking lock.");
    }

    private async Task<(HttpClient AdminClient, int ResourceId, HttpClient UserClient)> SetUpAsync()
    {
        var adminClient = await CreateAdminClientAsync();
        var resourceId = await CreateResourceWithWeeklyRuleAsync(adminClient, new TimeOnly(8, 0), new TimeOnly(16, 0));
        var userClient = await CreateUserClientAsync();

        return (adminClient, resourceId, userClient);
    }

    private static CreateAvailabilityExceptionDto Closure(int resourceId, int startHour, int endHour, string reason = "Maintenance")
    {
        return new CreateAvailabilityExceptionDto
        {
            ResourceId = resourceId,
            StartTime = BookingDay.AddHours(startHour),
            EndTime = BookingDay.AddHours(endHour),
            Reason = reason
        };
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

    private static string ScheduleUrl(int resourceId)
    {
        var day = DateOnly.FromDateTime(BookingDay).ToString("yyyy-MM-dd");

        return $"/api/resources/{resourceId}/schedule?from={day}&to={day}";
    }
}
