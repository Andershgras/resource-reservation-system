using Microsoft.EntityFrameworkCore;
using ResourceReservation.Api.Data;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.Models;

namespace ResourceReservation.Api.Services;

public class AvailabilityService
{
    public const int MaxScheduleDays = 62;

    private readonly AppDbContext _context;
    private readonly SchedulingClock _schedulingClock;

    public AvailabilityService(AppDbContext context, SchedulingClock schedulingClock)
    {
        _context = context;
        _schedulingClock = schedulingClock;
    }

    // Bookable time for a resource: its merged availability minus active
    // reservations, without time that has already passed.
    public async Task<ServiceResult<ResourceScheduleResponseDto>> GetScheduleAsync(
        int resourceId,
        DateOnly? from,
        DateOnly? to)
    {
        if (from is null || to is null)
        {
            return ServiceError.Validation("From and to dates are required.");
        }

        if (to < from)
        {
            return ServiceError.Validation("To date must be on or after from date.");
        }

        // The schedule endpoint is anonymous, so the amount of work per request is capped.
        if (to.Value == DateOnly.MaxValue ||
            to.Value.DayNumber - from.Value.DayNumber + 1 > MaxScheduleDays)
        {
            return ServiceError.Validation($"Date range cannot be longer than {MaxScheduleDays} days.");
        }

        var resource = await _context.Resources.FindAsync(resourceId);

        if (resource is null)
        {
            return ServiceError.NotFound("Resource not found.");
        }

        if (!resource.IsActive)
        {
            return ServiceError.Validation("Resource is not active.");
        }

        var rangeStart = from.Value.ToDateTime(TimeOnly.MinValue);
        var rangeEnd = to.Value.AddDays(1).ToDateTime(TimeOnly.MinValue);
        var reservedSlots = await GetReservedSlotsAsync(resourceId, rangeStart, rangeEnd);
        var availabilityIntervals = await GetAvailabilityIntervalsAsync(resourceId, from.Value, to.Value);
        var bookableSlots = RemoveTimeBefore(
            SubtractReservedSlots(
                availabilityIntervals,
                reservedSlots),
            GetNextWholeMinute(_schedulingClock.GetLocalNow()));

        return new ResourceScheduleResponseDto
        {
            ResourceId = resource.Id,
            ResourceName = resource.Name,
            FromDate = from.Value,
            ToDate = to.Value,
            BookableSlots = bookableSlots
                .Select(slot => new BookableSlotResponseDto
                {
                    StartTime = slot.StartTime,
                    EndTime = slot.EndTime
                })
                .ToList(),
            ReservedSlots = reservedSlots
                .Select(slot => new ReservedSlotResponseDto
                {
                    StartTime = slot.StartTime,
                    EndTime = slot.EndTime
                })
                .ToList()
        };
    }

    public async Task<List<TimeRange>> GetAvailabilityIntervalsAsync(
        int resourceId,
        DateOnly from,
        DateOnly to)
    {
        var rangeStart = from.ToDateTime(TimeOnly.MinValue);
        var rangeEnd = to.AddDays(1).ToDateTime(TimeOnly.MinValue);

        var oneOffAvailability = await _context.Availabilities
            .Where(availability =>
                availability.ResourceId == resourceId &&
                availability.StartTime < rangeEnd &&
                availability.EndTime > rangeStart)
            .Select(availability => new TimeRange(
                availability.StartTime < rangeStart ? rangeStart : availability.StartTime,
                availability.EndTime > rangeEnd ? rangeEnd : availability.EndTime))
            .ToListAsync();

        var rules = await _context.AvailabilityRules
            .Where(rule => rule.ResourceId == resourceId)
            .ToListAsync();
        var recurringAvailability = new List<TimeRange>();

        for (var date = from; date <= to; date = date.AddDays(1))
        {
            foreach (var rule in rules.Where(rule => rule.DayOfWeek == date.DayOfWeek))
            {
                recurringAvailability.Add(new TimeRange(
                    date.ToDateTime(rule.StartTime),
                    date.ToDateTime(rule.EndTime)));
            }
        }

        return MergeIntervals(oneOffAvailability.Concat(recurringAvailability));
    }

    public async Task<bool> IsWithinAvailabilityAsync(
        int resourceId,
        DateTime startTime,
        DateTime endTime)
    {
        var availabilityIntervals = await GetAvailabilityIntervalsAsync(
            resourceId,
            DateOnly.FromDateTime(startTime),
            DateOnly.FromDateTime(endTime));

        return availabilityIntervals.Any(interval =>
            startTime >= interval.StartTime &&
            endTime <= interval.EndTime);
    }

    public static List<TimeRange> SubtractReservedSlots(
        IEnumerable<TimeRange> availabilityIntervals,
        IEnumerable<TimeRange> reservedSlots)
    {
        var reservedSlotList = reservedSlots.ToList();
        var bookableSlots = new List<TimeRange>();

        foreach (var availability in availabilityIntervals)
        {
            var currentStart = availability.StartTime;
            var overlappingReservations = reservedSlotList
                .Where(reservation =>
                    reservation.StartTime < availability.EndTime &&
                    reservation.EndTime > availability.StartTime)
                .OrderBy(reservation => reservation.StartTime);

            foreach (var reservation in overlappingReservations)
            {
                if (reservation.StartTime > currentStart)
                {
                    bookableSlots.Add(new TimeRange(currentStart, reservation.StartTime));
                }

                if (reservation.EndTime > currentStart)
                {
                    currentStart = reservation.EndTime;
                }
            }

            if (currentStart < availability.EndTime)
            {
                bookableSlots.Add(new TimeRange(currentStart, availability.EndTime));
            }
        }

        return bookableSlots;
    }

    public static List<TimeRange> RemoveTimeBefore(
        IEnumerable<TimeRange> intervals,
        DateTime cutoff)
    {
        return intervals
            .Where(interval => interval.EndTime > cutoff)
            .Select(interval => interval.StartTime < cutoff
                ? interval with { StartTime = cutoff }
                : interval)
            .ToList();
    }

    private Task<List<TimeRange>> GetReservedSlotsAsync(
        int resourceId,
        DateTime rangeStart,
        DateTime rangeEnd)
    {
        return _context.Reservations
            .Where(reservation =>
                reservation.ResourceId == resourceId &&
                reservation.Status == ReservationStatuses.Active &&
                reservation.StartTime < rangeEnd &&
                reservation.EndTime > rangeStart)
            .OrderBy(reservation => reservation.StartTime)
            .Select(reservation => new TimeRange(
                reservation.StartTime < rangeStart ? rangeStart : reservation.StartTime,
                reservation.EndTime > rangeEnd ? rangeEnd : reservation.EndTime))
            .ToListAsync();
    }

    // Starts in-progress slots at a whole minute so time inputs get clean values.
    private static DateTime GetNextWholeMinute(DateTime value)
    {
        var wholeMinute = new DateTime(
            value.Year,
            value.Month,
            value.Day,
            value.Hour,
            value.Minute,
            0);

        return wholeMinute == value ? wholeMinute : wholeMinute.AddMinutes(1);
    }

    private static List<TimeRange> MergeIntervals(IEnumerable<TimeRange> intervals)
    {
        var sortedIntervals = intervals
            .Where(interval => interval.EndTime > interval.StartTime)
            .OrderBy(interval => interval.StartTime)
            .ToList();
        var mergedIntervals = new List<TimeRange>();

        foreach (var interval in sortedIntervals)
        {
            var previousInterval = mergedIntervals.LastOrDefault();

            if (previousInterval is null || interval.StartTime > previousInterval.EndTime)
            {
                mergedIntervals.Add(interval);
                continue;
            }

            if (interval.EndTime > previousInterval.EndTime)
            {
                mergedIntervals[^1] = previousInterval with { EndTime = interval.EndTime };
            }
        }

        return mergedIntervals;
    }
}

public sealed record TimeRange(DateTime StartTime, DateTime EndTime);
