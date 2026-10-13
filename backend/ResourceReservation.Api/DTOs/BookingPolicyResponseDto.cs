namespace ResourceReservation.Api.DTOs;

// The booking rules in force for a resource, after its overrides.
public class BookingPolicyResponseDto
{
    public int MinDurationMinutes { get; set; }

    public int MaxDurationMinutes { get; set; }

    public int MinLeadTimeMinutes { get; set; }

    public int MaxAdvanceDays { get; set; }

    public int MaxActiveReservationsPerUser { get; set; }
}
