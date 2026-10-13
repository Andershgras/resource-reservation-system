using ResourceReservation.Api.Configuration;
using ResourceReservation.Api.Models;

namespace ResourceReservation.Api.Services;

// The booking rules in force for one resource: its overrides, or the defaults.
// Booking validation and the schedule both use it, so they can't disagree.
public sealed record BookingPolicy(
    int MinDurationMinutes,
    int MaxDurationMinutes,
    int MinLeadTimeMinutes,
    int MaxAdvanceDays)
{
    public const string StartInFutureMessage = "Reservations must start in the future.";

    public static BookingPolicy For(Resource resource, BookingPolicyOptions defaults)
    {
        return new BookingPolicy(
            resource.MinDurationMinutes ?? defaults.MinDurationMinutes,
            resource.MaxDurationMinutes ?? defaults.MaxDurationMinutes,
            resource.MinLeadTimeMinutes ?? defaults.MinLeadTimeMinutes,
            resource.MaxAdvanceDays ?? defaults.MaxAdvanceDays);
    }

    public DateTime GetEarliestStart(DateTime localNow)
    {
        return localNow.AddMinutes(MinLeadTimeMinutes);
    }

    // Midnight at the end of the last bookable day.
    public DateTime GetLatestEnd(DateTime localNow)
    {
        return DateOnly.FromDateTime(localNow)
            .AddDays(MaxAdvanceDays + 1)
            .ToDateTime(TimeOnly.MinValue);
    }

    // Null when the booking's time follows the rules. Availability and
    // overlaps are checked separately.
    public ServiceError? Check(DateTime startTime, DateTime endTime, DateTime localNow)
    {
        if (startTime < GetEarliestStart(localNow))
        {
            return ServiceError.Validation(MinLeadTimeMinutes == 0
                ? StartInFutureMessage
                : $"Bookings must be made at least {FormatMinutes(MinLeadTimeMinutes)} in advance.");
        }

        if (endTime > GetLatestEnd(localNow))
        {
            return ServiceError.Validation(
                $"Bookings can be made up to {FormatDays(MaxAdvanceDays)} ahead.");
        }

        var durationMinutes = (endTime - startTime).TotalMinutes;

        if (durationMinutes < MinDurationMinutes)
        {
            return ServiceError.Validation(
                $"Bookings must be at least {FormatMinutes(MinDurationMinutes)} long.");
        }

        if (durationMinutes > MaxDurationMinutes)
        {
            return ServiceError.Validation(
                $"Bookings can be at most {FormatMinutes(MaxDurationMinutes)} long.");
        }

        return null;
    }

    // Such as "15 minutes", "8 hours", "1 hour 30 minutes" or "2 days".
    public static string FormatMinutes(int minutes)
    {
        const int minutesPerDay = 24 * 60;

        if (minutes >= minutesPerDay && minutes % minutesPerDay == 0)
        {
            return FormatDays(minutes / minutesPerDay);
        }

        var hours = minutes / 60;
        var remainder = minutes % 60;
        var parts = new List<string>();

        if (hours > 0)
        {
            parts.Add(hours == 1 ? "1 hour" : $"{hours} hours");
        }

        if (remainder > 0 || hours == 0)
        {
            parts.Add(remainder == 1 ? "1 minute" : $"{remainder} minutes");
        }

        return string.Join(" ", parts);
    }

    private static string FormatDays(int days)
    {
        return days == 1 ? "1 day" : $"{days} days";
    }
}
