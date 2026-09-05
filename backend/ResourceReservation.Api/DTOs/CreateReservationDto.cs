namespace ResourceReservation.Api.DTOs;

public class CreateReservationDto
{
    public int ResourceId { get; set; }

    public DateTime StartTime { get; set; }

    public DateTime EndTime { get; set; }
}
