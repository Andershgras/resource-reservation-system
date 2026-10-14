using System.ComponentModel.DataAnnotations;

namespace ResourceReservation.Api.Configuration;

// Locks an account for LockoutMinutes after MaxFailedAttempts failed sign-ins
// in a row. Attempts during a lockout don't extend it.
public class AccountLockoutOptions
{
    public const string SectionName = "AccountLockout";

    [Range(1, 100, ErrorMessage = "AccountLockout:MaxFailedAttempts must be between 1 and 100.")]
    public int MaxFailedAttempts { get; set; } = 5;

    [Range(1, 1440, ErrorMessage = "AccountLockout:LockoutMinutes must be between 1 and 1440.")]
    public int LockoutMinutes { get; set; } = 15;
}
