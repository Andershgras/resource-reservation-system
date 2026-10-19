namespace ResourceReservation.Api.DTOs;

// The anti-forgery request token, sent back in the X-CSRF-TOKEN header with
// every request that changes something (ADR 0012).
public class CsrfTokenDto
{
    public string Token { get; set; } = string.Empty;
}
