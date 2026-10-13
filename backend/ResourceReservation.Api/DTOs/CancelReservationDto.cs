namespace ResourceReservation.Api.DTOs;

public class CancelReservationDto
{
    // Optional. When sent, the cancellation is rejected if the reservation has
    // changed since this version was read.
    public string? Version { get; set; }
}
