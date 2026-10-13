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

public class ReservationTests : ApiTestBase
{
    public ReservationTests(ApiFixture fixture)
        : base(fixture)
    {
    }

    [Fact]
    public async Task BookingFlow_CreatesReservationAndUpdatesSchedule()
    {
        var adminClient = await CreateAdminClientAsync();
        var resourceId = await CreateResourceWithWeeklyRuleAsync(
            adminClient,
            new TimeOnly(8, 0),
            new TimeOnly(16, 0));
        var userClient = await CreateUserClientAsync();

        var createResponse = await userClient.PostAsJsonAsync("/api/reservations", new CreateReservationDto
        {
            ResourceId = resourceId,
            StartTime = BookingDay.AddHours(10),
            EndTime = BookingDay.AddHours(11)
        });

        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);

        var myReservations = await userClient
            .GetFromJsonAsync<List<ReservationResponseDto>>("/api/reservations/me");
        var reservation = Assert.Single(myReservations!);
        Assert.Equal(ReservationStatuses.Active, reservation.Status);
        Assert.Equal("Integration User", reservation.UserName);
        Assert.Equal("user@integration.test", reservation.UserEmail);

        var allReservations = await adminClient
            .GetFromJsonAsync<List<ReservationResponseDto>>("/api/reservations");
        Assert.Equal("user@integration.test", Assert.Single(allReservations!).UserEmail);

        var day = DateOnly.FromDateTime(BookingDay).ToString("yyyy-MM-dd");
        var schedule = await userClient.GetFromJsonAsync<ResourceScheduleResponseDto>(
            $"/api/resources/{resourceId}/schedule?from={day}&to={day}");
        Assert.Equal(
            [
                (BookingDay.AddHours(8), BookingDay.AddHours(10)),
                (BookingDay.AddHours(11), BookingDay.AddHours(16))
            ],
            schedule!.BookableSlots.Select(slot => (slot.StartTime, slot.EndTime)));
    }

    [Fact]
    public async Task AnonymousSchedule_ShowsReservedTimesWithoutIdentifyingReservations()
    {
        var adminClient = await CreateAdminClientAsync();
        var resourceId = await CreateResourceWithWeeklyRuleAsync(
            adminClient,
            new TimeOnly(8, 0),
            new TimeOnly(16, 0));
        var userClient = await CreateUserClientAsync();
        var createResponse = await userClient.PostAsJsonAsync("/api/reservations", new CreateReservationDto
        {
            ResourceId = resourceId,
            StartTime = BookingDay.AddHours(10),
            EndTime = BookingDay.AddHours(11)
        });
        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);

        var day = DateOnly.FromDateTime(BookingDay).ToString("yyyy-MM-dd");
        var schedule = await CreateAnonymousClient().GetFromJsonAsync<JsonElement>(
            $"/api/resources/{resourceId}/schedule?from={day}&to={day}");

        var reservedSlot = Assert.Single(schedule.GetProperty("reservedSlots").EnumerateArray());
        Assert.Equal(
            ["endTime", "startTime"],
            reservedSlot.EnumerateObject().Select(property => property.Name).Order());
    }

    [Fact]
    public async Task ReservationLifecycle_EnforcesOwnershipAndAdminAccess()
    {
        var adminClient = await CreateAdminClientAsync();
        var resourceId = await CreateResourceWithWeeklyRuleAsync(
            adminClient,
            new TimeOnly(8, 0),
            new TimeOnly(16, 0));
        var ownerClient = await CreateUserClientAsync("owner@integration.test");
        var otherClient = await CreateUserClientAsync("other@integration.test");
        var createResponse = await ownerClient.PostAsJsonAsync("/api/reservations", new CreateReservationDto
        {
            ResourceId = resourceId,
            StartTime = BookingDay.AddHours(12),
            EndTime = BookingDay.AddHours(13)
        });
        var reservation = await createResponse.Content.ReadFromJsonAsync<ReservationResponseDto>();
        var reservationPath = $"/api/reservations/{reservation!.Id}";

        Assert.Equal(reservationPath, createResponse.Headers.Location?.AbsolutePath);
        Assert.Equal(HttpStatusCode.OK, (await ownerClient.GetAsync(reservationPath)).StatusCode);
        await ProblemAssert.IsProblemAsync(await otherClient.GetAsync(reservationPath), HttpStatusCode.Forbidden);
        await ProblemAssert.IsProblemAsync(
            await otherClient.PutAsync($"{reservationPath}/cancel", null),
            HttpStatusCode.Forbidden);
        Assert.Single((await adminClient.GetFromJsonAsync<List<ReservationResponseDto>>(
            $"/api/reservations/resource/{resourceId}"))!);
        Assert.Single((await adminClient.GetFromJsonAsync<List<ReservationResponseDto>>(
            $"/api/reservations/user/{reservation.UserId}"))!);
        await ProblemAssert.IsProblemAsync(
            await adminClient.GetAsync("/api/reservations/resource/999"),
            HttpStatusCode.NotFound,
            "Resource does not exist.");

        Assert.Equal(
            HttpStatusCode.NoContent,
            (await ownerClient.PutAsync($"{reservationPath}/cancel", null)).StatusCode);
        await ProblemAssert.IsProblemAsync(
            await ownerClient.PutAsync($"{reservationPath}/cancel", null),
            HttpStatusCode.BadRequest,
            "Reservation is already cancelled.");
        var cancelled = await adminClient.GetFromJsonAsync<ReservationResponseDto>(reservationPath);
        Assert.Equal(ReservationStatuses.Cancelled, cancelled!.Status);
    }

    [Fact]
    public async Task CreateReservation_WhenSameSlotIsBookedInParallel_OnlyOneSucceeds()
    {
        const int parallelRequests = 10;
        var adminClient = await CreateAdminClientAsync();
        var resourceId = await CreateResourceWithWeeklyRuleAsync(
            adminClient,
            new TimeOnly(8, 0),
            new TimeOnly(16, 0));
        var userClient = await CreateUserClientAsync();
        var request = new CreateReservationDto
        {
            ResourceId = resourceId,
            StartTime = BookingDay.AddHours(9),
            EndTime = BookingDay.AddHours(10)
        };

        var responses = await Task.WhenAll(Enumerable.Range(0, parallelRequests)
            .Select(_ => userClient.PostAsJsonAsync("/api/reservations", request)));

        var statusCodes = responses.Select(response => response.StatusCode).ToList();
        Assert.Equal(1, statusCodes.Count(status => status == HttpStatusCode.Created));
        Assert.Equal(parallelRequests - 1, statusCodes.Count(status => status == HttpStatusCode.Conflict));

        await using var context = Fixture.CreateDbContext();
        Assert.Equal(1, await context.Reservations.CountAsync(reservation =>
            reservation.ResourceId == resourceId &&
            reservation.Status == ReservationStatuses.Active));
    }

    [Fact]
    public async Task CreateReservation_WhenResourceLockIsHeld_ReturnsServiceUnavailableWithRetryAfter()
    {
        var adminClient = await CreateAdminClientAsync();
        var resourceId = await CreateResourceWithWeeklyRuleAsync(
            adminClient,
            new TimeOnly(8, 0),
            new TimeOnly(16, 0));
        var userClient = await CreateUserClientAsync();
        await using var shortTimeoutFactory = new ApiFactory(
            Fixture.ConnectionString,
            new Dictionary<string, string> { ["Scheduling:BookingLockTimeoutMilliseconds"] = "500" });
        var client = shortTimeoutFactory.CreateClient();
        client.DefaultRequestHeaders.Authorization = userClient.DefaultRequestHeaders.Authorization;
        var request = new CreateReservationDto
        {
            ResourceId = resourceId,
            StartTime = BookingDay.AddHours(9),
            EndTime = BookingDay.AddHours(10)
        };

        // Simulate a slow booking in progress by holding the resource's lock elsewhere.
        await using var connection = new SqlConnection(Fixture.ConnectionString);
        await connection.OpenAsync();
        var transaction = connection.BeginTransaction();
        await using (var command = connection.CreateCommand())
        {
            command.Transaction = transaction;
            command.CommandText =
                $"EXEC sp_getapplock @Resource = 'reservation:resource:{resourceId}', " +
                "@LockMode = 'Exclusive', @LockOwner = 'Transaction';";
            await command.ExecuteNonQueryAsync();
        }

        var busyResponse = await client.PostAsJsonAsync("/api/reservations", request);

        transaction.Rollback();
        var retryResponse = await client.PostAsJsonAsync("/api/reservations", request);

        await ProblemAssert.IsProblemAsync(
            busyResponse,
            HttpStatusCode.ServiceUnavailable,
            ReservationService.ResourceBusyMessage);
        Assert.Equal(TimeSpan.FromSeconds(5), busyResponse.Headers.RetryAfter?.Delta);
        Assert.Equal(HttpStatusCode.Created, retryResponse.StatusCode);
    }
}
