using System.ComponentModel.DataAnnotations;

namespace ResourceReservation.Api.Configuration;

// Limits the requests that send email (registration, resending a verification
// link and asking for a password reset) per client IP address, with a token
// bucket like the sign-in limit but stricter. The per-account cooldown stops
// repeated emails to one address; this stops one client mailing many.
public class EmailRateLimitOptions
{
    public const string SectionName = "RateLimiting:Email";

    [Range(1, 10000, ErrorMessage = "RateLimiting:Email:PermitLimit must be between 1 and 10000.")]
    public int PermitLimit { get; set; } = 5;

    [Range(1, 86400, ErrorMessage = "RateLimiting:Email:WindowSeconds must be between 1 and 86400.")]
    public int WindowSeconds { get; set; } = 900;

    public TimeSpan GetReplenishmentPeriod()
    {
        return TimeSpan.FromSeconds(WindowSeconds) / PermitLimit;
    }
}
