using Microsoft.EntityFrameworkCore;
using ResourceReservation.Api.Data;

namespace ResourceReservation.Api.Services;

public class AvailabilityService
{
    private readonly AppDbContext _context;

    public AvailabilityService(AppDbContext context)
    {
        _context = context;
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
