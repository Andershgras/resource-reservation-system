namespace ResourceReservation.Api.DTOs;

// A browser session: returned by POST /api/auth/login, which puts the token in
// an httpOnly cookie instead of this body, and by GET /api/auth/me.
public class SessionResponseDto
{
    // When the session ends, in UTC.
    public DateTimeOffset ExpiresAt { get; set; }

    // The session's remaining lifetime from now. Clients whose clock may be
    // wrong should use this rather than ExpiresAt.
    public int ExpiresInSeconds { get; set; }

    public UserResponseDto User { get; set; } = new();
}
