using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.IntegrationTests.Infrastructure;
using ResourceReservation.Api.Models;

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
}
