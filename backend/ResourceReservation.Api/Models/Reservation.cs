namespace ResourceReservation.Api.Models;

public class Reservation
{
    public int Id { get; set; }

    public int ResourceId { get; set; }

    public int UserId { get; set; }

    public DateTime StartTime { get; set; }

    public DateTime EndTime { get; set; }

    public string Status { get; set; } = ReservationStatuses.Active;

    // Audit timestamps are UTC instants, unlike StartTime and EndTime, which are
    // wall-clock times (ADR 0001). They are null for reservations made before
    // they were recorded, rather than an invented time.
    public DateTimeOffset? CreatedAt { get; set; }

    // When the booking's time last changed.
    public DateTimeOffset? UpdatedAt { get; set; }

    public DateTimeOffset? CancelledAt { get; set; }

    public int? CancelledByUserId { get; set; }

    // SQL Server rowversion, changed by every update. Used to reject an update
    // based on an out-of-date copy of the reservation.
    public byte[] Version { get; set; } = [];

    public Resource? Resource { get; set; }
    public User? User { get; set; }
    public User? CancelledBy { get; set; }
}
