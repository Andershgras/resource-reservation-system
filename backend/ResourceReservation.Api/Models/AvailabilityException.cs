namespace ResourceReservation.Api.Models;

// A closure: time when a resource can't be booked even though its opening
// hours say otherwise, such as a holiday or maintenance. Closures may overlap,
// and each keeps its own reason; the availability calculation combines them.
public class AvailabilityException
{
    public int Id { get; set; }

    public int ResourceId { get; set; }

    // Wall-clock times in the scheduling time zone, like availability (ADR 0001).
    public DateTime StartTime { get; set; }

    public DateTime EndTime { get; set; }

    // Shown to everyone in the calendar.
    public string Reason { get; set; } = string.Empty;

    // UTC, like the reservation audit times.
    public DateTimeOffset CreatedAt { get; set; }

    public int? CreatedByUserId { get; set; }

    public Resource? Resource { get; set; }

    public User? CreatedBy { get; set; }
}
