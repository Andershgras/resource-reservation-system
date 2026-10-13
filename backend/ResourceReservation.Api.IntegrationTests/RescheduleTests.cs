using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.IntegrationTests.Infrastructure;
using ResourceReservation.Api.Models;
using ResourceReservation.Api.Services;

namespace ResourceReservation.Api.IntegrationTests;

public class RescheduleTests : ApiTestBase
{
    public RescheduleTests(ApiFixture fixture)
        : base(fixture)
    {
    }

    [Fact]
    public async Task Reschedule_MovesTheBookingAndReturnsANewVersion()
    {
        var (_, resourceId, userClient) = await SetUpAsync();
        var reservation = await BookAsync(userClient, resourceId, 9, 10);

        var response = await userClient.PutAsJsonAsync($"/api/reservations/{reservation.Id}", Move(reservation, 13, 14));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var moved = await response.Content.ReadFromJsonAsync<ReservationResponseDto>();
        Assert.Equal((BookingDay.AddHours(13), BookingDay.AddHours(14)), (moved!.StartTime, moved.EndTime));
        Assert.NotNull(moved.UpdatedAt);
        Assert.Equal(reservation.CreatedAt, moved.CreatedAt);
        Assert.NotEqual(reservation.Version, moved.Version);

        var schedule = await userClient.GetFromJsonAsync<ResourceScheduleResponseDto>(ScheduleUrl(resourceId));
        Assert.Equal(
            [(BookingDay.AddHours(13), BookingDay.AddHours(14))],
            schedule!.ReservedSlots.Select(slot => (slot.StartTime, slot.EndTime)));
    }

    [Fact]
    public async Task Reschedule_WithoutAVersion_ReturnsAFieldError()
    {
        var (_, resourceId, userClient) = await SetUpAsync();
        var reservation = await BookAsync(userClient, resourceId, 9, 10);

        var response = await userClient.PutAsJsonAsync($"/api/reservations/{reservation.Id}", new
        {
            startTime = BookingDay.AddHours(11),
            endTime = BookingDay.AddHours(12)
        });

        var problem = await ProblemAssert.IsProblemAsync<ValidationProblemDetails>(response, HttpStatusCode.BadRequest);
        Assert.Equal("Reload the reservation and try again.", problem.Errors["Version"][0]);
    }

    [Fact]
    public async Task Schedule_LeavesOutTheBookingBeingMoved_ForItsOwnerOrAnAdminOnly()
    {
        var (adminClient, resourceId, userClient) = await SetUpAsync();
        var otherResourceId = await CreateResourceWithWeeklyRuleAsync(adminClient, new TimeOnly(8, 0), new TimeOnly(16, 0));
        var otherClient = await CreateUserClientAsync("other@integration.test");
        var reservation = await BookAsync(userClient, resourceId, 9, 10);
        var url = $"{ScheduleUrl(resourceId)}&excludeReservationId={reservation.Id}";

        var ownerSchedule = await userClient.GetFromJsonAsync<ResourceScheduleResponseDto>(url);
        var adminSchedule = await adminClient.GetFromJsonAsync<ResourceScheduleResponseDto>(url);

        Assert.Empty(ownerSchedule!.ReservedSlots);
        Assert.Equal(
            [(BookingDay.AddHours(8), BookingDay.AddHours(16))],
            ownerSchedule.BookableSlots.Select(slot => (slot.StartTime, slot.EndTime)));
        Assert.Empty(adminSchedule!.ReservedSlots);
        await ProblemAssert.IsProblemAsync(await CreateAnonymousClient().GetAsync(url), HttpStatusCode.Unauthorized);
        await ProblemAssert.IsProblemAsync(await otherClient.GetAsync(url), HttpStatusCode.Forbidden);
        await ProblemAssert.IsProblemAsync(
            await userClient.GetAsync($"{ScheduleUrl(otherResourceId)}&excludeReservationId={reservation.Id}"),
            HttpStatusCode.BadRequest,
            "The reservation is for a different resource.");
    }

    [Fact]
    public async Task OutOfDateCopies_AreRejectedWithConflict()
    {
        var (adminClient, resourceId, userClient) = await SetUpAsync();
        var reservation = await BookAsync(userClient, resourceId, 9, 10);
        var adminMove = await adminClient.PutAsJsonAsync(
            $"/api/reservations/{reservation.Id}",
            Move(reservation, 11, 12));
        Assert.Equal(HttpStatusCode.OK, adminMove.StatusCode);

        // The user still has the copy from before the admin's change.
        var staleMove = await userClient.PutAsJsonAsync($"/api/reservations/{reservation.Id}", Move(reservation, 13, 14));
        var staleCancel = await userClient.PutAsJsonAsync(
            $"/api/reservations/{reservation.Id}/cancel",
            new CancelReservationDto { Version = reservation.Version });

        await ProblemAssert.IsProblemAsync(
            staleMove,
            HttpStatusCode.Conflict,
            ReservationService.ReservationChangedMessage);
        await ProblemAssert.IsProblemAsync(
            staleCancel,
            HttpStatusCode.Conflict,
            ReservationService.ReservationChangedMessage);
        var current = await userClient.GetFromJsonAsync<ReservationResponseDto>($"/api/reservations/{reservation.Id}");
        Assert.Equal((BookingDay.AddHours(11), ReservationStatuses.Active), (current!.StartTime, current.Status));

        // A cancellation with the current version, or with no body at all, still works.
        var cancel = await userClient.PutAsJsonAsync(
            $"/api/reservations/{reservation.Id}/cancel",
            new CancelReservationDto { Version = current.Version });
        Assert.Equal(HttpStatusCode.NoContent, cancel.StatusCode);
        var second = await BookAsync(userClient, resourceId, 14, 15);
        Assert.Equal(
            HttpStatusCode.NoContent,
            (await userClient.PutAsync($"/api/reservations/{second.Id}/cancel", null)).StatusCode);
    }

    [Fact]
    public async Task ParallelMoveAndCancel_OfTheSameBooking_OneWinsAndTheOtherGetsConflict()
    {
        const int rounds = 5;
        var (adminClient, resourceId, userClient) = await SetUpAsync();

        for (var round = 0; round < rounds; round++)
        {
            var reservation = await BookAsync(userClient, resourceId, 9, 10);

            var responses = await Task.WhenAll(
                userClient.PutAsJsonAsync($"/api/reservations/{reservation.Id}", Move(reservation, 11, 12)),
                adminClient.PutAsJsonAsync(
                    $"/api/reservations/{reservation.Id}/cancel",
                    new CancelReservationDto { Version = reservation.Version }));

            var statusCodes = responses.Select(response => response.StatusCode).ToList();
            Assert.Single(statusCodes, status => status is HttpStatusCode.OK or HttpStatusCode.NoContent);
            var conflict = Assert.Single(responses, response => response.StatusCode == HttpStatusCode.Conflict);
            await ProblemAssert.IsProblemAsync(
                conflict,
                HttpStatusCode.Conflict,
                ReservationService.ReservationChangedMessage);

            await using var context = Fixture.CreateDbContext();
            var saved = await context.Reservations.AsNoTracking().SingleAsync(r => r.Id == reservation.Id);
            var moved = statusCodes.Contains(HttpStatusCode.OK);
            Assert.Equal(moved ? ReservationStatuses.Active : ReservationStatuses.Cancelled, saved.Status);
            Assert.Equal(moved ? BookingDay.AddHours(11) : BookingDay.AddHours(9), saved.StartTime);

            if (moved)
            {
                Assert.Equal(
                    HttpStatusCode.NoContent,
                    (await userClient.PutAsync($"/api/reservations/{reservation.Id}/cancel", null)).StatusCode);
            }
        }
    }

    [Fact]
    public async Task ParallelMovesOfTwoBookingsIntoTheSameSlot_OnlyOneSucceeds()
    {
        var (_, resourceId, userClient) = await SetUpAsync();
        var first = await BookAsync(userClient, resourceId, 9, 10);
        var second = await BookAsync(userClient, resourceId, 10, 11);

        var responses = await Task.WhenAll(
            userClient.PutAsJsonAsync($"/api/reservations/{first.Id}", Move(first, 13, 14)),
            userClient.PutAsJsonAsync($"/api/reservations/{second.Id}", Move(second, 13, 14)));

        var statusCodes = responses.Select(response => response.StatusCode).ToList();
        Assert.Single(statusCodes, HttpStatusCode.OK);
        Assert.Single(statusCodes, HttpStatusCode.Conflict);
        await AssertNoOverlapsAsync(resourceId);
    }

    [Fact]
    public async Task ParallelBookingAndMoveIntoTheSameSlot_OnlyOneSucceeds()
    {
        var (_, resourceId, userClient) = await SetUpAsync();
        var otherClient = await CreateUserClientAsync("other@integration.test");
        var reservation = await BookAsync(userClient, resourceId, 9, 10);

        var responses = await Task.WhenAll(
            userClient.PutAsJsonAsync($"/api/reservations/{reservation.Id}", Move(reservation, 13, 14)),
            otherClient.PostAsJsonAsync("/api/reservations", new CreateReservationDto
            {
                ResourceId = resourceId,
                StartTime = BookingDay.AddHours(13),
                EndTime = BookingDay.AddHours(14)
            }));

        var statusCodes = responses.Select(response => response.StatusCode).ToList();
        Assert.Single(statusCodes, status => status is HttpStatusCode.OK or HttpStatusCode.Created);
        Assert.Single(statusCodes, HttpStatusCode.Conflict);
        await AssertNoOverlapsAsync(resourceId);
    }

    private async Task<(HttpClient AdminClient, int ResourceId, HttpClient UserClient)> SetUpAsync()
    {
        var adminClient = await CreateAdminClientAsync();
        var resourceId = await CreateResourceWithWeeklyRuleAsync(adminClient, new TimeOnly(8, 0), new TimeOnly(16, 0));
        var userClient = await CreateUserClientAsync();

        return (adminClient, resourceId, userClient);
    }

    private static async Task<ReservationResponseDto> BookAsync(
        HttpClient client,
        int resourceId,
        int startHour,
        int endHour)
    {
        var response = await client.PostAsJsonAsync("/api/reservations", new CreateReservationDto
        {
            ResourceId = resourceId,
            StartTime = BookingDay.AddHours(startHour),
            EndTime = BookingDay.AddHours(endHour)
        });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        return (await response.Content.ReadFromJsonAsync<ReservationResponseDto>())!;
    }

    private static RescheduleReservationDto Move(ReservationResponseDto reservation, int startHour, int endHour)
    {
        return new RescheduleReservationDto
        {
            StartTime = BookingDay.AddHours(startHour),
            EndTime = BookingDay.AddHours(endHour),
            Version = reservation.Version
        };
    }

    private static string ScheduleUrl(int resourceId)
    {
        var day = DateOnly.FromDateTime(BookingDay).ToString("yyyy-MM-dd");

        return $"/api/resources/{resourceId}/schedule?from={day}&to={day}";
    }

    private async Task AssertNoOverlapsAsync(int resourceId)
    {
        await using var context = Fixture.CreateDbContext();
        var active = await context.Reservations
            .Where(reservation => reservation.ResourceId == resourceId && reservation.Status == ReservationStatuses.Active)
            .OrderBy(reservation => reservation.StartTime)
            .ToListAsync();

        Assert.All(active.Zip(active.Skip(1)), pair => Assert.True(pair.First.EndTime <= pair.Second.StartTime));
    }
}
