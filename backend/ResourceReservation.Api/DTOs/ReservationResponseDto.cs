namespace ResourceReservation.Api.DTOs;

public class ReservationResponseDto
{
    public int Id { get; set; }

    public int ResourceId { get; set; }

    public string ResourceName { get; set; } = string.Empty;

    public int UserId { get; set; }

    public DateTime StartTime { get; set; }

    public DateTime EndTime { get; set; }

    public string Status { get; set; } = string.Empty;
}
