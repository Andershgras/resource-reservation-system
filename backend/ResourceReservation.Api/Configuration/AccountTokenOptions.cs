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
}
