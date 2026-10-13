using System.ComponentModel.DataAnnotations;

namespace ResourceReservation.Api.DTOs;

// Moves a reservation to a new time on the same resource.
public class RescheduleReservationDto
{
    [Required(ErrorMessage = "Enter a start time.")]
    public DateTime StartTime { get; set; }

    [Required(ErrorMessage = "Enter an end time.")]
    public DateTime EndTime { get; set; }

    // The version from the reservation the change is based on.
    [Required(ErrorMessage = "Reload the reservation and try again.")]
    public string Version { get; set; } = string.Empty;
}
