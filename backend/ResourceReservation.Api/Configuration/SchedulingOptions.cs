using System.ComponentModel.DataAnnotations;

namespace ResourceReservation.Api.Configuration;

public class SchedulingOptions : IValidatableObject
{
    public const string SectionName = "Scheduling";

    // IANA time zone ID that all stored reservation and availability times use.
    [Required(ErrorMessage = "Scheduling:TimeZoneId is required.")]
    public string TimeZoneId { get; set; } = string.Empty;

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
