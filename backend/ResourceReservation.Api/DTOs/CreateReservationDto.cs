using System.ComponentModel.DataAnnotations;

namespace ResourceReservation.Api.DTOs;

public class CreateReservationDto
{
    [Range(1, int.MaxValue)]
    public int ResourceId { get; set; }

    [Required]
    public DateTime StartTime { get; set; }

    [Required]
    public DateTime EndTime { get; set; }
}
