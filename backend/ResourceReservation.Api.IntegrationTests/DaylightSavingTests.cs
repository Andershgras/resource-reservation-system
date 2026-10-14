using System.Net;
using System.Net.Http.Json;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.IntegrationTests.Infrastructure;
using ResourceReservation.Api.Services;

namespace ResourceReservation.Api.IntegrationTests;

// On Sunday 31 March 2030 the Copenhagen clocks go from 02:00 straight to
// 03:00. No booking, move, closure or one-off window may start or end in that
// hour; periods across it are fine (ADR 0001).
public class DaylightSavingTests : ApiTestBase
{
    private static readonly DateTime SpringChange = new(2030, 3, 31);

    public DaylightSavingTests(ApiFixture fixture)
        : base(fixture)
    {
    }

    [Theory]
    [InlineData(2, 30, 3, 30)]
    [InlineData(2, 0, 3, 0)]
    [InlineData(1, 0, 2, 15)]
    [InlineData(2, 45, 4, 0)]
    public async Task ABookingThatStartsOrEndsInTheSkippedHour_IsRejected(
        int startHour, int startMinute, int endHour, int endMinute)
    {
        var (_, resourceId, userClient) = await SetUpAsync();

        var response = await userClient.PostAsJsonAsync("/api/reservations", new CreateReservationDto
        {
            ResourceId = resourceId,
            StartTime = SpringChange.AddHours(startHour).AddMinutes(startMinute),
            EndTime = SpringChange.AddHours(endHour).AddMinutes(endMinute)
        });

        await ProblemAssert.IsProblemAsync(response, HttpStatusCode.BadRequest, SchedulingClock.NonexistentTimeMessage);
    }

    [Fact]
    public async Task ABookingAcrossTheSkippedHour_IsAccepted_AndItsInvitationIsOneRealHour()
    {
        var (_, resourceId, userClient) = await SetUpAsync();

        var response = await userClient.PostAsJsonAsync("/api/reservations", new CreateReservationDto
        {
            ResourceId = resourceId,
            StartTime = SpringChange.AddHours(1).AddMinutes(30),
            EndTime = SpringChange.AddHours(3).AddMinutes(30)
        });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var invite = Assert.Single((await TestEmailSink.Instance.WaitForAsync("user@integration.test")).Single().Attachments);
        // 01:30 winter time and 03:30 summer time are both 00:30 and 01:30 UTC.
        Assert.Contains("DTSTART:20300331T003000Z\r\n", invite.Content);
        Assert.Contains("DTEND:20300331T013000Z\r\n", invite.Content);
    }

    [Fact]
    public async Task MovingABookingIntoTheSkippedHour_IsRejected()
    {
        var (_, resourceId, userClient) = await SetUpAsync();
        var created = await userClient.PostAsJsonAsync("/api/reservations", new CreateReservationDto
        {
            ResourceId = resourceId,
            StartTime = SpringChange.AddHours(4),
            EndTime = SpringChange.AddHours(5)
        });
        var booking = (await created.Content.ReadFromJsonAsync<ReservationResponseDto>())!;

        var moved = await userClient.PutAsJsonAsync($"/api/reservations/{booking.Id}", new RescheduleReservationDto
        {
            StartTime = SpringChange.AddHours(2).AddMinutes(30),
            EndTime = SpringChange.AddHours(3).AddMinutes(30),
            Version = booking.Version
        });

        await ProblemAssert.IsProblemAsync(moved, HttpStatusCode.BadRequest, SchedulingClock.NonexistentTimeMessage);
    }

    [Fact]
    public async Task ClosuresAndOneOffWindows_CannotStartOrEndInTheSkippedHour()
    {
        var (adminClient, resourceId, _) = await SetUpAsync();
        var closure = new CreateAvailabilityExceptionDto
        {
            ResourceId = resourceId,
            StartTime = SpringChange.AddHours(2).AddMinutes(30),
            EndTime = SpringChange.AddHours(4),
            Reason = "Night maintenance"
        };
        var window = new CreateAvailabilityDto
        {
            ResourceId = resourceId,
            StartTime = SpringChange.AddHours(1),
            EndTime = SpringChange.AddHours(2).AddMinutes(30)
        };

        await ProblemAssert.IsProblemAsync(
            await adminClient.PostAsJsonAsync("/api/availabilityexceptions/preview", closure),
            HttpStatusCode.BadRequest,
            SchedulingClock.NonexistentTimeMessage);
        await ProblemAssert.IsProblemAsync(
            await adminClient.PostAsJsonAsync("/api/availabilityexceptions", closure),
            HttpStatusCode.BadRequest,
            SchedulingClock.NonexistentTimeMessage);
        await ProblemAssert.IsProblemAsync(
            await adminClient.PostAsJsonAsync("/api/availabilities", window),
            HttpStatusCode.BadRequest,
            SchedulingClock.NonexistentTimeMessage);
        // Across the hour is fine.
        closure.StartTime = SpringChange.AddHours(1);
        Assert.Equal(HttpStatusCode.Created, (await adminClient.PostAsJsonAsync("/api/availabilityexceptions", closure)).StatusCode);
    }

    // Open all Sunday night, 00:00–06:00, so only the clock decides.
    private async Task<(HttpClient Admin, int ResourceId, HttpClient User)> SetUpAsync()
    {
        var adminClient = await CreateAdminClientAsync();
        var resource = await (await adminClient.PostAsJsonAsync("/api/resources", new CreateResourceDto
        {
            Name = "Night Room"
        })).Content.ReadFromJsonAsync<ResourceResponseDto>();
        var rule = await adminClient.PostAsJsonAsync("/api/availabilityrules", new CreateAvailabilityRuleDto
        {
            ResourceId = resource!.Id,
            DayOfWeek = (int)DayOfWeek.Sunday,
            StartTime = new TimeOnly(0, 0),
            EndTime = new TimeOnly(6, 0)
        });
        Assert.Equal(HttpStatusCode.Created, rule.StatusCode);
        var userClient = await CreateUserClientAsync();
        TestEmailSink.Instance.Clear();

        return (adminClient, resource.Id, userClient);
    }
}
