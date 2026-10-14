using System.ComponentModel.DataAnnotations;

namespace ResourceReservation.Api.Configuration;

// How the booking email worker polls and retries.
public class EmailOutboxOptions
{
    public const string SectionName = "EmailOutbox";

    [Range(100, 300000, ErrorMessage = "EmailOutbox:PollIntervalMilliseconds must be between 100 and 300000.")]
    public int PollIntervalMilliseconds { get; set; } = 5000;

    // Attempts before an email is given up and logged as failed.
    [Range(1, 20, ErrorMessage = "EmailOutbox:MaxAttempts must be between 1 and 20.")]
    public int MaxAttempts { get; set; } = 6;

    // The wait after the first failure. Each later wait is four times longer,
    // up to an hour: 30 s, 2 min, 8 min, 32 min, 1 h by default.
    [Range(1, 3600, ErrorMessage = "EmailOutbox:FirstRetryDelaySeconds must be between 1 and 3600.")]
    public int FirstRetryDelaySeconds { get; set; } = 30;

    public TimeSpan GetRetryDelay(int failedAttempts)
    {
        var seconds = FirstRetryDelaySeconds * Math.Pow(4, Math.Max(0, failedAttempts - 1));

        return TimeSpan.FromSeconds(Math.Min(seconds, 3600));
    }
}
