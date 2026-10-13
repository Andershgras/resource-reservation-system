using System.ComponentModel.DataAnnotations;

namespace ResourceReservation.Api.DTOs;

// A closure to preview or create.
public class CreateAvailabilityExceptionDto
{
    [Range(1, int.MaxValue, ErrorMessage = "Select a resource.")]
    public int ResourceId { get; set; }

    [Required(ErrorMessage = "Enter a start time.")]
    public DateTime StartTime { get; set; }

    [Required(ErrorMessage = "Enter an end time.")]
    public DateTime EndTime { get; set; }

    [Required(ErrorMessage = "Enter a reason, such as a holiday or maintenance.")]
    [StringLength(200, ErrorMessage = "Reason must be 200 characters or fewer.")]
    public string Reason { get; set; } = string.Empty;
}
