namespace ResourceReservation.Api.Models;

public class Reservation
{
    public int Id { get; set; }

    public int ResourceId { get; set; }

    public int UserId { get; set; }

    public DateTime StartTime { get; set; }

    public DateTime EndTime { get; set; }

    public string Status { get; set; } = ReservationStatuses.Active;

    public Resource? Resource { get; set; }
    public User? User { get; set; }
}
