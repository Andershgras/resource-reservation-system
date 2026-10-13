namespace ResourceReservation.Api.DTOs;

public class ReservationResponseDto
{
    public int Id { get; set; }

    public int ResourceId { get; set; }

    public string ResourceName { get; set; } = string.Empty;

    public int UserId { get; set; }

    // Only the reservation's owner and admins can read a reservation, so the
    // owner's name and email are safe to include.
    public string UserName { get; set; } = string.Empty;

    public string UserEmail { get; set; } = string.Empty;

    public DateTime StartTime { get; set; }

    public DateTime EndTime { get; set; }

    public string Status { get; set; } = string.Empty;
}
