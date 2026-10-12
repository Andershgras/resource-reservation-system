using System.ComponentModel.DataAnnotations;

namespace ResourceReservation.Api.Configuration;

// Limits login and registration attempts per client IP address.
// A client can make PermitLimit attempts at once. After that, one more attempt
// is allowed every WindowSeconds / PermitLimit seconds, so on average no more
// than PermitLimit attempts are allowed per window.
public class AuthRateLimitOptions
{
    public const string SectionName = "RateLimiting:Auth";

    [Range(1, 10000, ErrorMessage = "RateLimiting:Auth:PermitLimit must be between 1 and 10000.")]
    public int PermitLimit { get; set; } = 10;

    [Range(1, 3600, ErrorMessage = "RateLimiting:Auth:WindowSeconds must be between 1 and 3600.")]
    public int WindowSeconds { get; set; } = 60;

    // A method, not a property, so startup validation never evaluates it with invalid values.
    public TimeSpan GetReplenishmentPeriod()
    {
        return TimeSpan.FromSeconds(WindowSeconds) / PermitLimit;
    }
}
