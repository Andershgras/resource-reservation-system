using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using ResourceReservation.Api.Configuration;
using ResourceReservation.Api.Data;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.Models;

namespace ResourceReservation.Api.Services;

public class AvailabilityService
{
    public const int MaxScheduleDays = 62;

    private readonly AppDbContext _context;
    private readonly SchedulingClock _schedulingClock;
    private readonly BookingPolicyOptions _bookingPolicyOptions;

    public AvailabilityService(
        AppDbContext context,
        SchedulingClock schedulingClock,
        IOptions<BookingPolicyOptions> bookingPolicyOptions)
    {
        _context = context;
        _schedulingClock = schedulingClock;
        _bookingPolicyOptions = bookingPolicyOptions.Value;
    }

    // Bookable time for a resource: its merged availability minus active
    // reservations, limited to the time its booking policy allows. Periods
    // shorter than the minimum booking are left out, since nothing fits, and
    // so is everything when the policy can't be met.
    // A reservation being moved can be left out, so its own time shows as free.
    public async Task<ServiceResult<ResourceScheduleResponseDto>> GetScheduleAsync(
        int resourceId,
        DateOnly? from,
        DateOnly? to,
        int? excludedReservationId = null)
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
        var reservedSlots = await GetReservedSlotsAsync(resourceId, rangeStart, rangeEnd, excludedReservationId);
        var openingHours = await GetOpeningHoursAsync(resourceId, from.Value, to.Value);
        var closures = await GetClosuresAsync(resourceId, rangeStart, rangeEnd);
        var availabilityIntervals = SubtractTimeRanges(openingHours, closures.Select(closure => closure.Range));
        var policy = BookingPolicy.For(resource, _bookingPolicyOptions);
        var localNow = _schedulingClock.GetLocalNow();
        var bookableSlots = RemoveTimeAfter(
                RemoveTimeBefore(
                    SubtractTimeRanges(
                        availabilityIntervals,
                        reservedSlots),
                    GetNextWholeMinute(policy.GetEarliestStart(localNow))),
                policy.GetLatestEnd(localNow))
            .Where(slot =>
                policy.CanBeMet &&
                (slot.EndTime - slot.StartTime).TotalMinutes >= policy.MinDurationMinutes)
            .ToList();

        return new ResourceScheduleResponseDto
        {
            ResourceId = resource.Id,
            ResourceName = resource.Name,
            FromDate = from.Value,
            ToDate = to.Value,
            Policy = new BookingPolicyResponseDto
            {
                MinDurationMinutes = policy.MinDurationMinutes,
                MaxDurationMinutes = policy.MaxDurationMinutes,
                MinLeadTimeMinutes = policy.MinLeadTimeMinutes,
                MaxAdvanceDays = policy.MaxAdvanceDays,
                MaxActiveReservationsPerUser = _bookingPolicyOptions.MaxActiveReservationsPerUser
            },
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
                .ToList(),
            ClosedSlots = GetClosedTime(openingHours, closures)
                .Select(slot => new ClosedSlotResponseDto
                {
                    StartTime = slot.StartTime,
                    EndTime = slot.EndTime,
                    Reasons = slot.Reasons.ToList()
                })
                .ToList()
        };
    }

    // Bookable availability: opening hours (one-off windows and weekly rules,
    // merged) minus closures. Booking validation and the schedule both use it,
    // so they can't disagree (audit H2, ADR 0009).
    public async Task<List<TimeRange>> GetAvailabilityIntervalsAsync(
        int resourceId,
        DateOnly from,
        DateOnly to)
    {
        var rangeStart = from.ToDateTime(TimeOnly.MinValue);
        var rangeEnd = to.AddDays(1).ToDateTime(TimeOnly.MinValue);
        var openingHours = await GetOpeningHoursAsync(resourceId, from, to);
        var closures = await GetClosuresAsync(resourceId, rangeStart, rangeEnd);

        return SubtractTimeRanges(openingHours, closures.Select(closure => closure.Range));
    }

    // One-off windows and weekly rules, merged, before closures.
    private async Task<List<TimeRange>> GetOpeningHoursAsync(
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

    // Removes time from intervals, such as reservations or closures. The time
    // removed may overlap itself; each overlapping part is removed once.
    public static List<TimeRange> SubtractTimeRanges(
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

    public static List<TimeRange> RemoveTimeAfter(
        IEnumerable<TimeRange> intervals,
        DateTime cutoff)
    {
        return intervals
            .Where(interval => interval.StartTime < cutoff)
            .Select(interval => interval.EndTime > cutoff
                ? interval with { EndTime = cutoff }
                : interval)
            .ToList();
    }

    // The closed part of the opening hours, for the calendar. Time a closure
    // covers outside opening hours is left out, since nothing could be booked
    // then anyway. Overlapping closures show as one period with each reason.
    public static List<ClosedTime> GetClosedTime(
        IEnumerable<TimeRange> openingHours,
        IEnumerable<ClosureRange> closures)
    {
        var openingList = openingHours.ToList();
        var pieces = closures
            .SelectMany(closure => openingList
                .Where(open => closure.Range.StartTime < open.EndTime && closure.Range.EndTime > open.StartTime)
                .Select(open => new ClosedTime(
                    closure.Range.StartTime > open.StartTime ? closure.Range.StartTime : open.StartTime,
                    closure.Range.EndTime < open.EndTime ? closure.Range.EndTime : open.EndTime,
                    [closure.Reason])))
            .OrderBy(piece => piece.StartTime)
            .ThenBy(piece => piece.EndTime);
        var closedTime = new List<ClosedTime>();

        foreach (var piece in pieces)
        {
            var previous = closedTime.LastOrDefault();

            if (previous is null || piece.StartTime >= previous.EndTime)
            {
                closedTime.Add(piece);
                continue;
            }

            closedTime[^1] = previous with
            {
                EndTime = piece.EndTime > previous.EndTime ? piece.EndTime : previous.EndTime,
                Reasons = previous.Reasons.Union(piece.Reasons).ToList()
            };
        }

        return closedTime;
    }

    private async Task<List<ClosureRange>> GetClosuresAsync(
        int resourceId,
        DateTime rangeStart,
        DateTime rangeEnd)
    {
        var closures = await _context.AvailabilityExceptions
            .Where(closure =>
                closure.ResourceId == resourceId &&
                closure.StartTime < rangeEnd &&
                closure.EndTime > rangeStart)
            .OrderBy(closure => closure.StartTime)
            .Select(closure => new { closure.StartTime, closure.EndTime, closure.Reason })
            .ToListAsync();

        return closures
            .Select(closure => new ClosureRange(
                new TimeRange(closure.StartTime, closure.EndTime),
                closure.Reason))
            .ToList();
    }

    private Task<List<TimeRange>> GetReservedSlotsAsync(
        int resourceId,
        DateTime rangeStart,
        DateTime rangeEnd,
        int? excludedReservationId)
    {
        return _context.Reservations
            .Where(reservation =>
                reservation.Id != excludedReservationId &&
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

public sealed record ClosureRange(TimeRange Range, string Reason);

public sealed record ClosedTime(DateTime StartTime, DateTime EndTime, IReadOnlyList<string> Reasons);
