namespace ResourceReservation.Api.DTOs;

public class AvailabilityExceptionResponseDto
{
    public int Id { get; set; }

    public int ResourceId { get; set; }

    public string ResourceName { get; set; } = string.Empty;

    public DateTime StartTime { get; set; }

    public DateTime EndTime { get; set; }

    public string Reason { get; set; } = string.Empty;

    // UTC.
    public DateTimeOffset CreatedAt { get; set; }

    public string? CreatedByName { get; set; }
}

// The closure that was created, and the active reservations inside it. They
// are not cancelled: the admin decides what to do with each.
public class AvailabilityExceptionCreatedDto
{
    public AvailabilityExceptionResponseDto Closure { get; set; } = new();

    public List<ReservationResponseDto> AffectedReservations { get; set; } = [];
}
