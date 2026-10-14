namespace ResourceReservation.Api.Models;

// A single-use link token, such as for email verification or a password reset.
// Only a SHA-256 hash of the token is stored; the token itself exists only in
// the email that carries it (ADR 0011).
public class UserToken
{
    public const int TokenHashLength = 64;

    public int Id { get; set; }

    public int UserId { get; set; }

    public string Purpose { get; set; } = string.Empty;

    // Hex SHA-256 of the token.
    public string TokenHash { get; set; } = string.Empty;

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset ExpiresAt { get; set; }

    // Set when the token is used, or when a newer token or a password reset
    // replaces it. A token with a value here never works again.
    public DateTimeOffset? UsedAt { get; set; }

    public User? User { get; set; }
}

public static class UserTokenPurposes
{
    public const string EmailVerification = "EmailVerification";

    public const string PasswordReset = "PasswordReset";
}
