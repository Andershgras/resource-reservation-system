using System.ComponentModel.DataAnnotations;

namespace ResourceReservation.Api.DTOs;

public class UpdateAvailabilityDto
{
    [Range(1, int.MaxValue, ErrorMessage = "Select a resource.")]
    public int ResourceId { get; set; }

    [Required(ErrorMessage = "Enter a start time.")]
    public DateTime StartTime { get; set; }

    [Required(ErrorMessage = "Enter an end time.")]
    public DateTime EndTime { get; set; }
}
