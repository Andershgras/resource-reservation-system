using System.Security.Cryptography;

namespace ResourceReservation.Api.Models;

public class User
{
    public const int SecurityStampLength = 64;

    public int Id { get; set; }

    public string Name { get; set; } = string.Empty;

    public string Email { get; set; } = string.Empty;

    public string PasswordHash { get; set; } = string.Empty;

    public string Role { get; set; } = UserRoles.User;

    // A deactivated user can't sign in, and their tokens stop working. Their
    // reservations are kept.
    public bool IsActive { get; set; } = true;

    // A random value that changes whenever the user's existing tokens must stop
    // working, such as a role change or deactivation. Tokens carry a hash of it,
    // and every authenticated request compares that hash with this value. It is
    // never returned by the API.
    public string SecurityStamp { get; set; } = NewSecurityStamp();

    // Null for accounts created before it was recorded.
    public DateTimeOffset? CreatedAt { get; set; }

    // New accounts can't sign in until the owner of the address confirms it
    // (ADR 0011). Accounts from before verification existed count as confirmed.
    public bool IsEmailConfirmed { get; set; }

    // Null for accounts confirmed before it was recorded, and unconfirmed ones.
    public DateTimeOffset? EmailConfirmedAt { get; set; }

    // Failed sign-ins since the last success or lockout. Reaching the limit
    // locks the account until LockoutEndsAt and starts the count again.
    public int FailedLoginCount { get; set; }

    public DateTimeOffset? LockoutEndsAt { get; set; }

    public List<Reservation> Reservations { get; set; } = [];

    // 32 bytes from the cryptographic random number generator, as hex.
    public static string NewSecurityStamp()
    {
        return RandomNumberGenerator.GetHexString(SecurityStampLength);
    }
}
