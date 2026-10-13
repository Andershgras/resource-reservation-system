namespace ResourceReservation.Api.DTOs;

// Opening hours that a closure takes away, with the reason for each closure
// that covers them. Shown to everyone in the calendar.
public class ClosedSlotResponseDto
{
    public DateTime StartTime { get; set; }
    public DateTime EndTime { get; set; }
    public List<string> Reasons { get; set; } = [];
}
