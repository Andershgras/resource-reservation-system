using System.ComponentModel.DataAnnotations;

namespace ResourceReservation.Api.Configuration;

public class SchedulingOptions : IValidatableObject
{
    public const string SectionName = "Scheduling";

    // IANA time zone ID that all stored reservation and availability times use.
    [Required(ErrorMessage = "Scheduling:TimeZoneId is required.")]
    public string TimeZoneId { get; set; } = string.Empty;

    // How long a booking waits for another booking of the same resource to finish.
    [Range(100, 60000, ErrorMessage = "Scheduling:BookingLockTimeoutMilliseconds must be between 100 and 60000.")]
    public int BookingLockTimeoutMilliseconds { get; set; } = 10000;

    public TimeZoneInfo GetTimeZone()
    {
        return TimeZoneInfo.FindSystemTimeZoneById(TimeZoneId);
    }

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (string.IsNullOrWhiteSpace(TimeZoneId))
        {
            yield break;
        }

        if (!TimeZoneInfo.TryFindSystemTimeZoneById(TimeZoneId, out _))
        {
            yield return new ValidationResult(
                $"Scheduling:TimeZoneId '{TimeZoneId}' is not a known time zone.",
                [nameof(TimeZoneId)]);
        }
    }
}
