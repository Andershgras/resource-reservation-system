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

    // UTC instants. Null for reservations made before these were recorded.
    public DateTimeOffset? CreatedAt { get; set; }

    public DateTimeOffset? UpdatedAt { get; set; }

    public DateTimeOffset? CancelledAt { get; set; }

    public int? CancelledByUserId { get; set; }

    public string? CancelledByName { get; set; }

    // Opaque. Send it back when moving or cancelling, so a change based on an
    // out-of-date copy is rejected.
    public string Version { get; set; } = string.Empty;
}
