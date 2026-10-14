using System.ComponentModel.DataAnnotations;

namespace ResourceReservation.Api.Configuration;

// Lifetimes of the links in account emails, and how often each account can be
// sent one of each kind.
public class AccountTokenOptions
{
    public const string SectionName = "AccountTokens";

    [Range(1, 168, ErrorMessage = "AccountTokens:EmailVerificationHours must be between 1 and 168.")]
    public int EmailVerificationHours { get; set; } = 24;

    [Range(5, 1440, ErrorMessage = "AccountTokens:PasswordResetMinutes must be between 5 and 1440.")]
    public int PasswordResetMinutes { get; set; } = 60;

    // Requests within this time of the last email of the same kind to the same
    // account get the usual answer but send nothing.
    [Range(0, 3600, ErrorMessage = "AccountTokens:EmailCooldownSeconds must be between 0 and 3600.")]
    public int EmailCooldownSeconds { get; set; } = 120;

    // Registration, resending a verification link and asking for a reset
    // answer no sooner than this. Whether an address has an account changes
    // how much database work a request does, by a few milliseconds; the floor
    // hides that difference as long as the work fits inside it. 0 turns it off.
    [Range(0, 5000, ErrorMessage = "AccountTokens:MinimumResponseMilliseconds must be between 0 and 5000.")]
    public int MinimumResponseMilliseconds { get; set; } = 250;
}
