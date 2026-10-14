namespace ResourceReservation.Api.Models;

// A booking email waiting to be sent: the outbox (ADR 0011). It is saved in
// the same transaction as the booking change, with a snapshot of the booking
// at that moment, so the email is built the same way on every attempt and
// says what happened even if the booking changes again before it is sent.
public class BookingNotification
{
    public const int LastErrorMaxLength = 500;

    public int Id { get; set; }

    public int ReservationId { get; set; }

    public string Kind { get; set; } = string.Empty;

    // Wall-clock times in the scheduling time zone, like the reservation's.
    public DateTime StartTime { get; set; }

    public DateTime EndTime { get; set; }

    public int CalendarSequence { get; set; }

    public string ResourceName { get; set; } = string.Empty;

    public string? ResourceLocation { get; set; }

    public string RecipientName { get; set; } = string.Empty;

    public string RecipientEmail { get; set; } = string.Empty;

    // An admin made the change to someone else's booking.
    public bool ChangedByAdmin { get; set; }

    // When the change happened, in UTC. Also the invitation's DTSTAMP.
    public DateTimeOffset CreatedAt { get; set; }

    public int Attempts { get; set; }

    // When the worker may next try. While a worker is sending, it is pushed
    // ahead as a lease, so another worker doesn't send the same email.
    public DateTimeOffset NextAttemptAt { get; set; }

    public DateTimeOffset? SentAt { get; set; }

    // Set after the last allowed attempt fails. The email is then given up.
    public DateTimeOffset? FailedAt { get; set; }

    public string? LastError { get; set; }

    public Reservation? Reservation { get; set; }
}

public static class BookingNotificationKinds
{
    public const string Created = "Created";

    public const string Moved = "Moved";

    public const string Cancelled = "Cancelled";
}
