namespace ResourceReservation.Api.DTOs;

// A bearer token for clients other than browsers, from POST /api/auth/token.
public class AuthResponseDto
{
    public string Token { get; set; } = string.Empty;

    // When the token stops being accepted, in UTC.
    public DateTimeOffset ExpiresAt { get; set; }

    // The token lifetime from now. Clients whose clock may be wrong should use
    // this rather than ExpiresAt.
    public int ExpiresInSeconds { get; set; }

    public UserResponseDto User { get; set; } = new();
}