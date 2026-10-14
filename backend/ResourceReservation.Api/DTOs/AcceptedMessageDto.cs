namespace ResourceReservation.Api.DTOs;

// The one answer to a request that may send an email, whatever happened, so it
// never reveals whether an address has an account.
public class AcceptedMessageDto
{
    public string Message { get; set; } = string.Empty;
}
