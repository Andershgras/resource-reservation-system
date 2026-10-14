using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using ResourceReservation.Api.Configuration;
using ResourceReservation.Api.Data;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.Models;
using ResourceReservation.Api.Services;

namespace ResourceReservation.Api.Tests;

// Closures (availability exceptions) in the shared availability calculation,
// so bookings, moves and the schedule all agree.
public class ClosureTests
{
    // Wednesday.
    private static readonly DateTime Day = new(2030, 1, 16);

    [Fact]
    public async Task OverlappingClosures_AreCombined_AndShownWithEachReason()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceAsync(context, DayOfWeek.Wednesday, 8, 16);
        await SeedClosureAsync(context, resource.Id, Day.AddHours(10), Day.AddHours(12), "Cleaning");
        await SeedClosureAsync(context, resource.Id, Day.AddHours(11), Day.AddHours(13), "Repairs");

        var schedule = await GetScheduleAsync(context, resource.Id, Day);

        Assert.Equal(
            [(Day.AddHours(8), Day.AddHours(10)), (Day.AddHours(13), Day.AddHours(16))],
            schedule.BookableSlots.Select(slot => (slot.StartTime, slot.EndTime)));
        var closed = Assert.Single(schedule.ClosedSlots);
        Assert.Equal((Day.AddHours(10), Day.AddHours(13)), (closed.StartTime, closed.EndTime));
        Assert.Equal(["Cleaning", "Repairs"], closed.Reasons);
    }

    [Fact]
    public async Task DeletingOneOverlappingClosure_LeavesTheOtherInForce()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceAsync(context, DayOfWeek.Wednesday, 8, 16);
        var cleaning = await SeedClosureAsync(context, resource.Id, Day.AddHours(10), Day.AddHours(12), "Cleaning");
        await SeedClosureAsync(context, resource.Id, Day.AddHours(11), Day.AddHours(13), "Repairs");

        var result = await CreateClosureService(context).DeleteAsync(cleaning.Id);

        Assert.True(result.IsSuccess);
        var schedule = await GetScheduleAsync(context, resource.Id, Day);
        Assert.Equal(
            [(Day.AddHours(8), Day.AddHours(11)), (Day.AddHours(13), Day.AddHours(16))],
            schedule.BookableSlots.Select(slot => (slot.StartTime, slot.EndTime)));
        Assert.Equal(["Repairs"], Assert.Single(schedule.ClosedSlots).Reasons);
    }

    [Fact]
    public async Task ClosedSlots_CoverOnlyOpeningHours()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceAsync(context, DayOfWeek.Wednesday, 8, 16);
        // A whole-day holiday, and a closure entirely outside opening hours.
        await SeedClosureAsync(context, resource.Id, Day, Day.AddDays(1), "Holiday");
        await SeedClosureAsync(context, resource.Id, Day.AddHours(-6), Day.AddHours(-2), "Night works");

        var schedule = await GetScheduleAsync(context, resource.Id, Day);

        Assert.Empty(schedule.BookableSlots);
        var closed = Assert.Single(schedule.ClosedSlots);
        Assert.Equal((Day.AddHours(8), Day.AddHours(16), "Holiday"), (closed.StartTime, closed.EndTime, Assert.Single(closed.Reasons)));
    }

    [Theory]
    // Ends exactly when the closure starts, or starts exactly when it ends.
    [InlineData(9, 0, 10, 0, true)]
    [InlineData(12, 0, 13, 0, true)]
    // One minute into the closure at either end.
    [InlineData(9, 0, 10, 1, false)]
    [InlineData(11, 59, 13, 0, false)]
    // Covering it entirely.
    [InlineData(9, 0, 13, 0, false)]
    public async Task Booking_AtTheClosureBoundaries(int startHour, int startMinute, int endHour, int endMinute, bool allowed)
    {
        await using var context = CreateContext();
        var resource = await SeedResourceAsync(context, DayOfWeek.Wednesday, 8, 16);
        await SeedClosureAsync(context, resource.Id, Day.AddHours(10), Day.AddHours(12), "Cleaning");
        var user = await SeedUserAsync(context);

        var result = await CreateReservationService(context).CreateAsync(new CreateReservationDto
        {
            ResourceId = resource.Id,
            StartTime = Day.AddHours(startHour).AddMinutes(startMinute),
            EndTime = Day.AddHours(endHour).AddMinutes(endMinute)
        }, user.Id);

        Assert.Equal(allowed, result.IsSuccess);

        if (!allowed)
        {
            Assert.Equal("Resource is not available in this time period.", result.Error!.Message);
        }
    }

    [Fact]
    public async Task Rescheduling_IntoAClosure_IsRejected()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceAsync(context, DayOfWeek.Wednesday, 8, 16);
        var user = await SeedUserAsync(context);
        var reservation = await SeedReservationAsync(context, resource.Id, user.Id, Day.AddHours(8), Day.AddHours(9));
        await SeedClosureAsync(context, resource.Id, Day.AddHours(10), Day.AddHours(12), "Cleaning");

        var result = await CreateReservationService(context).RescheduleAsync(
            reservation.Id,
            new RescheduleReservationDto
            {
                StartTime = Day.AddHours(11),
                EndTime = Day.AddHours(12),
                Version = Convert.ToBase64String(reservation.Version)
            },
            new CurrentUser(user.Id, false));

        Assert.False(result.IsSuccess);
        Assert.Equal("Resource is not available in this time period.", result.Error.Message);
    }

    // Copenhagen moves its clocks forward at 02:00 on 31 March 2030 and back at
    // 03:00 on 27 October 2030. Times are wall-clock times (ADR 0001), so a
    // closure over the skipped or repeated hour closes exactly those clock
    // times, in the schedule and in booking validation alike.
    [Theory]
    [InlineData(2030, 3, 31)]
    [InlineData(2030, 10, 27)]
    public async Task ClosuresOverTheDaylightSavingHour_UseWallClockTimes(int year, int month, int day)
    {
        var date = new DateTime(year, month, day);
        await using var context = CreateContext();
        var resource = await SeedResourceAsync(context, DayOfWeek.Sunday, 1, 5);
        await SeedClosureAsync(context, resource.Id, date.AddHours(2), date.AddHours(3), "Clock change");
        var user = await SeedUserAsync(context);
        var reservations = CreateReservationService(context);

        var schedule = await GetScheduleAsync(context, resource.Id, date);
        var inside = await reservations.CreateAsync(new CreateReservationDto
        {
            ResourceId = resource.Id,
            StartTime = date.AddHours(2).AddMinutes(15),
            EndTime = date.AddHours(2).AddMinutes(45)
        }, user.Id);
        var after = await reservations.CreateAsync(new CreateReservationDto
        {
            ResourceId = resource.Id,
            StartTime = date.AddHours(3),
            EndTime = date.AddHours(4)
        }, user.Id);

        Assert.Equal(
            [(date.AddHours(1), date.AddHours(2)), (date.AddHours(3), date.AddHours(5))],
            schedule.BookableSlots.Select(slot => (slot.StartTime, slot.EndTime)));
        Assert.False(inside.IsSuccess);
        Assert.True(after.IsSuccess);
    }

    [Fact]
    public async Task Preview_ListsOnlyActiveReservationsOnThatResourceInsideTheClosure()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceAsync(context, DayOfWeek.Wednesday, 8, 16);
        var otherResource = await SeedResourceAsync(context, DayOfWeek.Wednesday, 8, 16);
        var user = await SeedUserAsync(context);
        var inside = await SeedReservationAsync(context, resource.Id, user.Id, Day.AddHours(11), Day.AddHours(13));
        await SeedReservationAsync(context, resource.Id, user.Id, Day.AddHours(10), Day.AddHours(11), ReservationStatuses.Cancelled);
        await SeedReservationAsync(context, resource.Id, user.Id, Day.AddHours(14), Day.AddHours(15));
        await SeedReservationAsync(context, otherResource.Id, user.Id, Day.AddHours(11), Day.AddHours(12));

        var result = await CreateClosureService(context).PreviewAsync(Closure(resource.Id, 10, 12));

        Assert.True(result.IsSuccess);
        var affected = Assert.Single(result.Value);
        Assert.Equal((inside.Id, "Test User"), (affected.Id, affected.UserName));
    }

    [Fact]
    public async Task Create_ReturnsTheAffectedReservations_AndNeverCancelsThem()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceAsync(context, DayOfWeek.Wednesday, 8, 16);
        var admin = await SeedUserAsync(context);
        var reservation = await SeedReservationAsync(context, resource.Id, admin.Id, Day.AddHours(11), Day.AddHours(12));

        var result = await CreateClosureService(context).CreateAsync(Closure(resource.Id, 10, 12, "  Repairs  "), admin.Id);

        Assert.True(result.IsSuccess);
        Assert.Equal(("Repairs", "Test User"), (result.Value.Closure.Reason, result.Value.Closure.CreatedByName));
        Assert.Equal(reservation.Id, Assert.Single(result.Value.AffectedReservations).Id);
        Assert.Equal(ReservationStatuses.Active, (await context.Reservations.FindAsync(reservation.Id))!.Status);
    }

    [Theory]
    [InlineData(12, 10, "Repairs", "EndTime must be after StartTime.")]
    [InlineData(10, 12, "   ", "Enter a reason, such as a holiday or maintenance.")]
    public async Task Create_RejectsInvalidClosures(int startHour, int endHour, string reason, string message)
    {
        await using var context = CreateContext();
        var resource = await SeedResourceAsync(context, DayOfWeek.Wednesday, 8, 16);

        var result = await CreateClosureService(context).CreateAsync(Closure(resource.Id, startHour, endHour, reason), 1);

        Assert.False(result.IsSuccess);
        Assert.Equal(message, result.Error.Message);
        Assert.Empty(context.AvailabilityExceptions);
    }

    [Fact]
    public async Task Create_RejectsAClosureThatHasAlreadyEnded()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceAsync(context, DayOfWeek.Wednesday, 8, 16);
        var service = CreateClosureService(context, localNow: Day.AddHours(13));

        var result = await service.CreateAsync(Closure(resource.Id, 10, 12), 1);

        Assert.False(result.IsSuccess);
        Assert.Equal("Closures must end in the future.", result.Error.Message);
    }

    private static CreateAvailabilityExceptionDto Closure(int resourceId, int startHour, int endHour, string reason = "Repairs")
    {
        return new CreateAvailabilityExceptionDto
        {
            ResourceId = resourceId,
            StartTime = Day.AddHours(startHour),
            EndTime = Day.AddHours(endHour),
            Reason = reason
        };
    }

    private static async Task<ResourceScheduleResponseDto> GetScheduleAsync(AppDbContext context, int resourceId, DateTime day)
    {
        var date = DateOnly.FromDateTime(day);
        var result = await CreateAvailabilityService(context).GetScheduleAsync(resourceId, date, date);

        Assert.True(result.IsSuccess);

        return result.Value;
    }

    private static AvailabilityService CreateAvailabilityService(AppDbContext context, DateTime? localNow = null)
    {
        return new AvailabilityService(context, TestSchedulingClock.Create(localNow), TestBookingPolicy.Create());
    }

    private static ReservationService CreateReservationService(AppDbContext context, DateTime? localNow = null)
    {
        var clock = TestSchedulingClock.Create(localNow);
        var bookingPolicy = TestBookingPolicy.Create();

        return new ReservationService(
            context,
            new AvailabilityService(context, clock, bookingPolicy),
            clock,
            new ApplicationLocks(context, Options.Create(new SchedulingOptions { TimeZoneId = "Europe/Copenhagen" })),
            bookingPolicy);
    }

    private static AvailabilityExceptionService CreateClosureService(AppDbContext context, DateTime? localNow = null)
    {
        return new AvailabilityExceptionService(
            context,
            CreateReservationService(context, localNow),
            new ApplicationLocks(context, Options.Create(new SchedulingOptions { TimeZoneId = "Europe/Copenhagen" })),
            TestSchedulingClock.Create(localNow));
    }

    private static AppDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        return new AppDbContext(options);
    }

    private static async Task<Resource> SeedResourceAsync(AppDbContext context, DayOfWeek dayOfWeek, int openHour, int closeHour)
    {
        var resource = new Resource { Name = $"Room {Guid.NewGuid():N}", IsActive = true };
        context.Resources.Add(resource);
        await context.SaveChangesAsync();
        context.AvailabilityRules.Add(new AvailabilityRule
        {
            ResourceId = resource.Id,
            DayOfWeek = dayOfWeek,
            StartTime = new TimeOnly(openHour, 0),
            EndTime = new TimeOnly(closeHour, 0)
        });
        await context.SaveChangesAsync();

        return resource;
    }

    private static async Task<AvailabilityException> SeedClosureAsync(
        AppDbContext context,
        int resourceId,
        DateTime startTime,
        DateTime endTime,
        string reason)
    {
        var closure = new AvailabilityException
        {
            ResourceId = resourceId,
            StartTime = startTime,
            EndTime = endTime,
            Reason = reason
        };
        context.AvailabilityExceptions.Add(closure);
        await context.SaveChangesAsync();

        return closure;
    }

    private static async Task<User> SeedUserAsync(AppDbContext context)
    {
        var user = new User { Name = "Test User", Email = $"{Guid.NewGuid()}@example.com", PasswordHash = "hash" };
        context.Users.Add(user);
        await context.SaveChangesAsync();

        return user;
    }

    private static async Task<Reservation> SeedReservationAsync(
        AppDbContext context,
        int resourceId,
        int userId,
        DateTime startTime,
        DateTime endTime,
        string status = ReservationStatuses.Active)
    {
        var reservation = new Reservation
        {
            ResourceId = resourceId,
            UserId = userId,
            StartTime = startTime,
            EndTime = endTime,
            Status = status
        };
        context.Reservations.Add(reservation);
        await context.SaveChangesAsync();

        return reservation;
    }
}
