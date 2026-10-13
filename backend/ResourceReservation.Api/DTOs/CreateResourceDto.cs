using System.ComponentModel.DataAnnotations;
using ResourceReservation.Api.Configuration;

namespace ResourceReservation.Api.DTOs;

public class CreateResourceDto
{
    [Required(ErrorMessage = "Enter a resource name.")]
    [StringLength(100, ErrorMessage = "Name must be 100 characters or fewer.")]
    public string Name { get; set; } = string.Empty;

    [StringLength(500, ErrorMessage = "Description must be 500 characters or fewer.")]
    public string? Description { get; set; }

    [StringLength(200, ErrorMessage = "Location must be 200 characters or fewer.")]
    public string? Location { get; set; }

    // Booking rule overrides. Leave empty to use the default.
    [Range(1, BookingPolicyOptions.MaxDurationLimitMinutes, ErrorMessage = "Enter a minimum duration between 1 and 10080 minutes.")]
    public int? MinDurationMinutes { get; set; }

    [Range(1, BookingPolicyOptions.MaxDurationLimitMinutes, ErrorMessage = "Enter a maximum duration between 1 and 10080 minutes.")]
    public int? MaxDurationMinutes { get; set; }

    [Range(0, BookingPolicyOptions.MaxLeadTimeLimitMinutes, ErrorMessage = "Enter a notice period between 0 and 43200 minutes.")]
    public int? MinLeadTimeMinutes { get; set; }

    [Range(1, BookingPolicyOptions.MaxAdvanceDaysLimit, ErrorMessage = "Enter a number of days between 1 and 3650.")]
    public int? MaxAdvanceDays { get; set; }
}
