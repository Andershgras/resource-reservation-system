namespace ResourceReservation.Api.DTOs;

public class ReservedSlotResponseDto
{
    public int ReservationId { get; set; }
    public DateTime StartTime { get; set; }
    public DateTime EndTime { get; set; }
}
