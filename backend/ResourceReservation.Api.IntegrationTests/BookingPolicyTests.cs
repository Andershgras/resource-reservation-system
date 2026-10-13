using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.IntegrationTests.Infrastructure;

namespace ResourceReservation.Api.IntegrationTests;

public class BookingPolicyTests : ApiTestBase
{
    public BookingPolicyTests(ApiFixture fixture)
        : base(fixture)
    {
    }

    [Fact]
    public async Task Defaults_AreReadableBySignedInUsersOnly()
    {
        var userClient = await CreateUserClientAsync();

        var defaults = await userClient.GetFromJsonAsync<BookingPolicyResponseDto>("/api/bookingpolicy");

        Assert.Equal(
            (15, 480, 0, 5),
            (defaults!.MinDurationMinutes, defaults.MaxDurationMinutes, defaults.MinLeadTimeMinutes,
                defaults.MaxActiveReservationsPerUser));
        await ProblemAssert.IsProblemAsync(
            await CreateAnonymousClient().GetAsync("/api/bookingpolicy"),
            HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task ResourceOverrides_AreSavedAndApplyToBookingsAndTheSchedule()
    {
        var adminClient = await CreateAdminClientAsync();
        var resourceId = await CreateResourceWithWeeklyRuleAsync(
            adminClient,
            new TimeOnly(8, 0),
            new TimeOnly(16, 0));
        var updateResponse = await adminClient.PutAsJsonAsync($"/api/resources/{resourceId}", new UpdateResourceDto
        {
            Name = "Integration Room",
            IsActive = true,
            MaxDurationMinutes = 60,
            MinLeadTimeMinutes = 30
        });
        Assert.Equal(HttpStatusCode.NoContent, updateResponse.StatusCode);
        var userClient = await CreateUserClientAsync();

        var resource = await userClient.GetFromJsonAsync<ResourceResponseDto>($"/api/resources/{resourceId}");
        Assert.Equal(
            (null, 60, 30, null),
            (resource!.MinDurationMinutes, resource.MaxDurationMinutes, resource.MinLeadTimeMinutes,
                resource.MaxAdvanceDays));

        var tooLong = await userClient.PostAsJsonAsync("/api/reservations", new CreateReservationDto
        {
            ResourceId = resourceId,
            StartTime = BookingDay.AddHours(9),
            EndTime = BookingDay.AddHours(11)
        });
        await ProblemAssert.IsProblemAsync(
            tooLong,
            HttpStatusCode.BadRequest,
            "Bookings can be at most 1 hour long.");

        var day = DateOnly.FromDateTime(BookingDay).ToString("yyyy-MM-dd");
        var schedule = await CreateAnonymousClient().GetFromJsonAsync<ResourceScheduleResponseDto>(
            $"/api/resources/{resourceId}/schedule?from={day}&to={day}");
        Assert.Equal(
            (15, 60, 30),
            (schedule!.Policy.MinDurationMinutes, schedule.Policy.MaxDurationMinutes,
                schedule.Policy.MinLeadTimeMinutes));
    }

    [Fact]
    public async Task ResourceOverrides_ThatContradictTheDefaults_AreRejectedBesideTheField()
    {
        var adminClient = await CreateAdminClientAsync();

        var minimumTooLong = await adminClient.PostAsJsonAsync("/api/resources", new CreateResourceDto
        {
            Name = "Room",
            MinDurationMinutes = 600
        });
        var maximumTooShort = await adminClient.PostAsJsonAsync("/api/resources", new CreateResourceDto
        {
            Name = "Room",
            MinDurationMinutes = 60,
            MaxDurationMinutes = 30
        });
        var outOfRange = await adminClient.PostAsJsonAsync("/api/resources", new CreateResourceDto
        {
            Name = "Room",
            MinDurationMinutes = 0,
            MaxAdvanceDays = 0
        });

        var problem = await ProblemAssert.IsProblemAsync<ValidationProblemDetails>(
            minimumTooLong,
            HttpStatusCode.BadRequest);
        Assert.Equal(
            "The minimum duration can't be longer than the default maximum of 480 minutes.",
            problem.Errors["MinDurationMinutes"][0]);
        problem = await ProblemAssert.IsProblemAsync<ValidationProblemDetails>(
            maximumTooShort,
            HttpStatusCode.BadRequest);
        Assert.Equal(
            "The maximum duration can't be shorter than the minimum duration.",
            problem.Errors["MaxDurationMinutes"][0]);
        problem = await ProblemAssert.IsProblemAsync<ValidationProblemDetails>(
            outOfRange,
            HttpStatusCode.BadRequest);
        Assert.Equal("Enter a minimum duration between 1 and 10080 minutes.", problem.Errors["MinDurationMinutes"][0]);
        Assert.Equal("Enter a number of days between 1 and 3650.", problem.Errors["MaxAdvanceDays"][0]);
        Assert.Empty((await adminClient.GetFromJsonAsync<List<ResourceResponseDto>>("/api/resources"))!);
    }

    [Fact]
    public async Task ResourceOverrides_ThatNoBookingCouldMeet_AreRejected()
    {
        var adminClient = await CreateAdminClientAsync();

        // Two days' notice, but only one day ahead.
        var response = await adminClient.PostAsJsonAsync("/api/resources", new CreateResourceDto
        {
            Name = "Room",
            MinLeadTimeMinutes = 2880,
            MaxAdvanceDays = 1
        });

        var problem = await ProblemAssert.IsProblemAsync<ValidationProblemDetails>(
            response,
            HttpStatusCode.BadRequest);
        Assert.Equal(
            "Allow more days ahead, or less notice, so the shortest booking fits.",
            problem.Errors["MaxAdvanceDays"][0]);
        Assert.Empty((await adminClient.GetFromJsonAsync<List<ResourceResponseDto>>("/api/resources"))!);
    }

    [Fact]
    public async Task DefaultHorizon_AllowsBookingsUpTo90DaysAhead()
    {
        // The shared test API allows years ahead, so this uses the real default.
        await using var factory = new ApiFactory(
            Fixture.ConnectionString,
            new Dictionary<string, string> { ["BookingPolicy:MaxAdvanceDays"] = "90" });
        var adminClient = await CreateAdminClientAsync();
        var userClient = await CreateUserClientAsync();
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(
            DateTimeOffset.UtcNow,
            TimeZoneInfo.FindSystemTimeZoneById("Europe/Copenhagen")).DateTime);
        var lastDay = today.AddDays(90).ToDateTime(TimeOnly.MinValue);
        var resourceId = await CreateResourceWithWindowAsync(adminClient, lastDay.AddHours(20), lastDay.AddHours(26));
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = userClient.DefaultRequestHeaders.Authorization;

        var pastHorizon = await client.PostAsJsonAsync("/api/reservations", new CreateReservationDto
        {
            ResourceId = resourceId,
            StartTime = lastDay.AddHours(23),
            EndTime = lastDay.AddHours(25)
        });
        var lastBookableHour = await client.PostAsJsonAsync("/api/reservations", new CreateReservationDto
        {
            ResourceId = resourceId,
            StartTime = lastDay.AddHours(23),
            EndTime = lastDay.AddHours(24)
        });

        await ProblemAssert.IsProblemAsync(
            pastHorizon,
            HttpStatusCode.BadRequest,
            "Bookings can be made up to 90 days ahead.");
        Assert.Equal(HttpStatusCode.Created, lastBookableHour.StatusCode);
    }

    private static async Task<int> CreateResourceWithWindowAsync(
        HttpClient adminClient,
        DateTime startTime,
        DateTime endTime)
    {
        var resourceResponse = await adminClient.PostAsJsonAsync("/api/resources", new CreateResourceDto
        {
            Name = "Horizon Room"
        });
        var resource = await resourceResponse.Content.ReadFromJsonAsync<ResourceResponseDto>();
        var windowResponse = await adminClient.PostAsJsonAsync("/api/availabilities", new CreateAvailabilityDto
        {
            ResourceId = resource!.Id,
            StartTime = startTime,
            EndTime = endTime
        });
        Assert.Equal(HttpStatusCode.Created, windowResponse.StatusCode);

        return resource.Id;
    }
}
