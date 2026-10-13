using Microsoft.EntityFrameworkCore;
using ResourceReservation.Api.Data;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.Models;
using ResourceReservation.Api.Services;

namespace ResourceReservation.Api.Tests;

public class AvailabilityServiceTests
{
    [Fact]
    public async Task GetResourceSchedule_WhenResourceDoesNotExist_ReturnsNotFound()
    {
        await using var context = CreateContext();
        var service = CreateService(context);

        var result = await service.GetScheduleAsync(
            999,
            new DateOnly(2030, 1, 16),
            new DateOnly(2030, 1, 16));

        AssertError(result, ServiceErrorKind.NotFound, "Resource not found.");
    }

    [Fact]
    public async Task GetResourceSchedule_WhenDateRangeIsInvalid_ReturnsValidationError()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceAsync(context);
        var service = CreateService(context);

        var result = await service.GetScheduleAsync(
            resource.Id,
            new DateOnly(2030, 1, 17),
            new DateOnly(2030, 1, 16));

        AssertError(result, ServiceErrorKind.Validation, "To date must be on or after from date.");
    }

    [Fact]
    public async Task GetResourceSchedule_WhenDateRangeIsAtMaximum_ReturnsSchedule()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceAsync(context);
        var service = CreateService(context);
        var from = new DateOnly(2030, 1, 1);

        var result = await service.GetScheduleAsync(
            resource.Id,
            from,
            from.AddDays(AvailabilityService.MaxScheduleDays - 1));

        Assert.True(result.IsSuccess);
    }

    [Fact]
    public async Task GetResourceSchedule_WhenDateRangeIsTooLong_ReturnsValidationError()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceAsync(context);
        var service = CreateService(context);
        var from = new DateOnly(2030, 1, 1);

        var result = await service.GetScheduleAsync(
            resource.Id,
            from,
            from.AddDays(AvailabilityService.MaxScheduleDays));

        AssertError(result, ServiceErrorKind.Validation, "Date range cannot be longer than 62 days.");
    }

    [Fact]
    public async Task GetResourceSchedule_WhenToDateIsMaxValue_ReturnsValidationError()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceAsync(context);
        var service = CreateService(context);

        var result = await service.GetScheduleAsync(
            resource.Id,
            DateOnly.MaxValue,
            DateOnly.MaxValue);

        AssertError(result, ServiceErrorKind.Validation, "Date range cannot be longer than 62 days.");
    }

    [Fact]
    public async Task GetResourceSchedule_WhenRuleHasActiveReservation_ReturnsRemainingBookableSlots()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceAsync(context);
        await SeedAvailabilityRuleAsync(
            context,
            resource.Id,
            DayOfWeek.Wednesday,
            new TimeOnly(8, 0),
            new TimeOnly(16, 0));
        await SeedReservationAsync(
            context,
            resource.Id,
            ReservationStatuses.Active,
            new DateTime(2030, 1, 16, 10, 0, 0),
            new DateTime(2030, 1, 16, 11, 0, 0));
        var service = CreateService(context);

        var result = await service.GetScheduleAsync(
            resource.Id,
            new DateOnly(2030, 1, 16),
            new DateOnly(2030, 1, 16));

        Assert.True(result.IsSuccess);
        var response = result.Value;

        Assert.Equal(resource.Id, response.ResourceId);
        Assert.Equal("Meeting Room", response.ResourceName);
        Assert.Collection(
            response.BookableSlots,
            first =>
            {
                Assert.Equal(new DateTime(2030, 1, 16, 8, 0, 0), first.StartTime);
                Assert.Equal(new DateTime(2030, 1, 16, 10, 0, 0), first.EndTime);
            },
            second =>
            {
                Assert.Equal(new DateTime(2030, 1, 16, 11, 0, 0), second.StartTime);
                Assert.Equal(new DateTime(2030, 1, 16, 16, 0, 0), second.EndTime);
            });
        var reservedSlot = Assert.Single(response.ReservedSlots);
        Assert.Equal(new DateTime(2030, 1, 16, 10, 0, 0), reservedSlot.StartTime);
        Assert.Equal(new DateTime(2030, 1, 16, 11, 0, 0), reservedSlot.EndTime);
    }

    [Fact]
    public async Task GetResourceSchedule_WhenCancelledReservationOverlaps_ReturnsFullRuleSlot()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceAsync(context);
        await SeedAvailabilityRuleAsync(
            context,
            resource.Id,
            DayOfWeek.Wednesday,
            new TimeOnly(8, 0),
            new TimeOnly(16, 0));
        await SeedReservationAsync(
            context,
            resource.Id,
            ReservationStatuses.Cancelled,
            new DateTime(2030, 1, 16, 10, 0, 0),
            new DateTime(2030, 1, 16, 11, 0, 0));
        var service = CreateService(context);

        var result = await service.GetScheduleAsync(
            resource.Id,
            new DateOnly(2030, 1, 16),
            new DateOnly(2030, 1, 16));

        Assert.True(result.IsSuccess);
        var response = result.Value;
        var bookableSlot = Assert.Single(response.BookableSlots);

        Assert.Equal(new DateTime(2030, 1, 16, 8, 0, 0), bookableSlot.StartTime);
        Assert.Equal(new DateTime(2030, 1, 16, 16, 0, 0), bookableSlot.EndTime);
        Assert.Empty(response.ReservedSlots);
    }

    [Fact]
    public async Task GetResourceSchedule_WhenOneOffAvailabilityExists_ReturnsBookableSlot()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceAsync(context);
        await SeedAvailabilityAsync(
            context,
            resource.Id,
            new DateTime(2030, 1, 17, 14, 0, 0),
            new DateTime(2030, 1, 17, 15, 0, 0));
        var service = CreateService(context);

        var result = await service.GetScheduleAsync(
            resource.Id,
            new DateOnly(2030, 1, 17),
            new DateOnly(2030, 1, 17));

        Assert.True(result.IsSuccess);
        var response = result.Value;
        var bookableSlot = Assert.Single(response.BookableSlots);

        Assert.Equal(new DateTime(2030, 1, 17, 14, 0, 0), bookableSlot.StartTime);
        Assert.Equal(new DateTime(2030, 1, 17, 15, 0, 0), bookableSlot.EndTime);
    }

    [Fact]
    public async Task GetResourceSchedule_WhenNoRuleMatchesDate_ReturnsNoBookableSlots()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceAsync(context);
        await SeedAvailabilityRuleAsync(
            context,
            resource.Id,
            DayOfWeek.Wednesday,
            new TimeOnly(8, 0),
            new TimeOnly(16, 0));
        var service = CreateService(context);

        var result = await service.GetScheduleAsync(
            resource.Id,
            new DateOnly(2030, 1, 17),
            new DateOnly(2030, 1, 17));

        Assert.True(result.IsSuccess);
        var response = result.Value;

        Assert.Empty(response.BookableSlots);
        Assert.Empty(response.ReservedSlots);
    }

    [Fact]
    public async Task GetResourceSchedule_WhenSlotsAreInThePast_ReturnsOnlyFutureTime()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceAsync(context);
        await SeedAvailabilityRuleAsync(
            context,
            resource.Id,
            DayOfWeek.Wednesday,
            new TimeOnly(8, 0),
            new TimeOnly(16, 0));
        var service = CreateService(context,
            localNow: new DateTime(2030, 1, 16, 10, 37, 20));

        var result = await service.GetScheduleAsync(
            resource.Id,
            new DateOnly(2030, 1, 15),
            new DateOnly(2030, 1, 16));

        Assert.True(result.IsSuccess);
        var response = result.Value;
        var bookableSlot = Assert.Single(response.BookableSlots);

        Assert.Equal(new DateTime(2030, 1, 16, 10, 38, 0), bookableSlot.StartTime);
        Assert.Equal(new DateTime(2030, 1, 16, 16, 0, 0), bookableSlot.EndTime);
    }

    private static AvailabilityService CreateService(AppDbContext context, DateTime? localNow = null)
    {
        return new AvailabilityService(context, TestSchedulingClock.Create(localNow));
    }

    private static AppDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        return new AppDbContext(options);
    }

    private static async Task<Resource> SeedResourceAsync(
        AppDbContext context,
        bool isActive = true)
    {
        var resource = new Resource
        {
            Name = "Meeting Room",
            IsActive = isActive
        };

        context.Resources.Add(resource);
        await context.SaveChangesAsync();

        return resource;
    }

    private static async Task<AvailabilityRule> SeedAvailabilityRuleAsync(
        AppDbContext context,
        int resourceId,
        DayOfWeek dayOfWeek,
        TimeOnly startTime,
        TimeOnly endTime)
    {
        var rule = new AvailabilityRule
        {
            ResourceId = resourceId,
            DayOfWeek = dayOfWeek,
            StartTime = startTime,
            EndTime = endTime
        };

        context.AvailabilityRules.Add(rule);
        await context.SaveChangesAsync();

        return rule;
    }

    private static async Task<Availability> SeedAvailabilityAsync(
        AppDbContext context,
        int resourceId,
        DateTime startTime,
        DateTime endTime)
    {
        var availability = new Availability
        {
            ResourceId = resourceId,
            StartTime = startTime,
            EndTime = endTime
        };

        context.Availabilities.Add(availability);
        await context.SaveChangesAsync();

        return availability;
    }

    private static async Task<Reservation> SeedReservationAsync(
        AppDbContext context,
        int resourceId,
        string status = ReservationStatuses.Active,
        DateTime? startTime = null,
        DateTime? endTime = null)
    {
        var reservationStartTime = startTime ?? DateTime.UtcNow.AddDays(-2);
        var reservation = new Reservation
        {
            ResourceId = resourceId,
            UserId = 1,
            StartTime = reservationStartTime,
            EndTime = endTime ?? reservationStartTime.AddHours(1),
            Status = status
        };

        context.Reservations.Add(reservation);
        await context.SaveChangesAsync();

        return reservation;
    }

    private static void AssertError<T>(ServiceResult<T> result, ServiceErrorKind kind, string message)
    {
        Assert.False(result.IsSuccess);
        Assert.Equal(kind, result.Error.Kind);
        Assert.Equal(message, result.Error.Message);
    }
}
