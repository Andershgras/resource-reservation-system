using System.ComponentModel.DataAnnotations;

namespace ResourceReservation.Api.Configuration;

// The default booking rules. A resource can override each of the first four;
// the cap on active bookings applies across all resources.
public class BookingPolicyOptions : IValidatableObject
{
    public const string SectionName = "BookingPolicy";

    public const int MaxDurationLimitMinutes = 7 * 24 * 60;
    public const int MaxLeadTimeLimitMinutes = 30 * 24 * 60;
    public const int MaxAdvanceDaysLimit = 3650;

    [Range(1, MaxDurationLimitMinutes, ErrorMessage = "BookingPolicy:MinDurationMinutes must be between 1 and 10080.")]
    public int MinDurationMinutes { get; set; } = 15;

    [Range(1, MaxDurationLimitMinutes, ErrorMessage = "BookingPolicy:MaxDurationMinutes must be between 1 and 10080.")]
    public int MaxDurationMinutes { get; set; } = 8 * 60;

    // How long before its start a booking must be made. 0 allows bookings that start now.
    [Range(0, MaxLeadTimeLimitMinutes, ErrorMessage = "BookingPolicy:MinLeadTimeMinutes must be between 0 and 43200.")]
    public int MinLeadTimeMinutes { get; set; }

    // How many days ahead a booking can be. 90 allows bookings that end on or
    // before the end of the day 90 days from today.
    [Range(1, MaxAdvanceDaysLimit, ErrorMessage = "BookingPolicy:MaxAdvanceDays must be between 1 and 3650.")]
    public int MaxAdvanceDays { get; set; } = 90;

    // Bookings that are active and haven't ended yet, across all resources.
    [Range(1, 1000, ErrorMessage = "BookingPolicy:MaxActiveReservationsPerUser must be between 1 and 1000.")]
    public int MaxActiveReservationsPerUser { get; set; } = 5;

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (MinDurationMinutes > MaxDurationMinutes)
        {
            yield return new ValidationResult(
                "BookingPolicy:MinDurationMinutes cannot be greater than BookingPolicy:MaxDurationMinutes.",
                [nameof(MinDurationMinutes), nameof(MaxDurationMinutes)]);
        }
    }
}
