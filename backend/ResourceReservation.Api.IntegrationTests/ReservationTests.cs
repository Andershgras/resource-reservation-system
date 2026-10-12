using System.Net;
using System.Net.Http.Json;
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

        Assert.Equal(HttpStatusCode.ServiceUnavailable, busyResponse.StatusCode);
        Assert.Equal(TimeSpan.FromSeconds(5), busyResponse.Headers.RetryAfter?.Delta);
        var error = await busyResponse.Content.ReadFromJsonAsync<ErrorResponse>();
        Assert.Equal(ReservationService.ResourceBusyMessage, error?.Message);
        Assert.Equal(HttpStatusCode.Created, retryResponse.StatusCode);
    }

    private sealed record ErrorResponse(string? Message);
}
