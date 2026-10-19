using System.ComponentModel.DataAnnotations;

namespace ResourceReservation.Api.Configuration;

// How long data that is no longer needed is kept before the clean-up worker
// deletes it (ADR 0013). Every period counts from when the row stopped being
// needed: when an email was sent, a session expired, and so on.
public class RetentionOptions
{
    public const string SectionName = "Retention";

    // The tests turn the worker off and call the clean-up directly.
    public bool Enabled { get; set; } = true;

    [Range(1, 1440, ErrorMessage = "Retention:IntervalMinutes must be between 1 and 1440.")]
    public int IntervalMinutes { get; set; } = 60;

    // Rows deleted per statement, so a large clean-up never holds long locks.
    [Range(100, 100000, ErrorMessage = "Retention:BatchSize must be between 100 and 100000.")]
    public int BatchSize { get; set; } = 1000;

    [Range(1, 3650, ErrorMessage = "Retention:SentBookingEmailDays must be between 1 and 3650.")]
    public int SentBookingEmailDays { get; set; } = 30;

    // Kept longer than sent ones, to investigate why they failed.
    [Range(1, 3650, ErrorMessage = "Retention:FailedBookingEmailDays must be between 1 and 3650.")]
    public int FailedBookingEmailDays { get; set; } = 90;

    [Range(1, 3650, ErrorMessage = "Retention:ExpiredSessionDays must be between 1 and 3650.")]
    public int ExpiredSessionDays { get; set; } = 7;

    [Range(1, 3650, ErrorMessage = "Retention:UsedLinkTokenDays must be between 1 and 3650.")]
    public int UsedLinkTokenDays { get; set; } = 7;

    // Counted from registration. Whatever this is, an account is never deleted
    // while it has a verification or reset link that still works.
    [Range(2, 3650, ErrorMessage = "Retention:UnconfirmedAccountDays must be between 2 and 3650.")]
    public int UnconfirmedAccountDays { get; set; } = 7;
}
