namespace ResourceReservation.Api.Models;

// One sign-in: a browser session cookie or a bearer token from /api/auth/token.
// Every token carries its session's ID, and every authenticated request checks
// that the session exists, belongs to the token's user, hasn't expired and
// hasn't been revoked. Signing out revokes only this session (ADR 0012).
public class UserSession
{
    public const int ClientMaxLength = 10;

    // Random, so it can't be guessed. It isn't secret either: tokens are signed,
    // so a session ID alone can't be used to sign in.
    public Guid Id { get; set; }

    public int UserId { get; set; }

    // UserSessionClients: how the session was started.
    public string Client { get; set; } = UserSessionClients.Browser;

    public DateTimeOffset CreatedAt { get; set; }

    // The same as the token's expiry.
    public DateTimeOffset ExpiresAt { get; set; }

    // Set when the user signs out. A revoked session never works again.
    public DateTimeOffset? RevokedAt { get; set; }

    public User? User { get; set; }
}

public static class UserSessionClients
{
    // POST /api/auth/login: the token is in an httpOnly cookie.
    public const string Browser = "Browser";

    // POST /api/auth/token: the client sends the token as a bearer header.
    public const string Token = "Token";
}
