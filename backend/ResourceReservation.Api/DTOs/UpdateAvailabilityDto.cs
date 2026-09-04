namespace ResourceReservation.Api.DTOs;

public class UpdateAvailabilityDto
{
    public int ResourceId { get; set; }

    public DateTime StartTime { get; set; }

    public DateTime EndTime { get; set; }
}