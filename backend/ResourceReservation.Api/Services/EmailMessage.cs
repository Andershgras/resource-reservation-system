namespace ResourceReservation.Api.Services;

// An email ready to send. MessageId, when set, is the same on every attempt,
// so a mail client can recognise a duplicate after a retry.
public sealed record EmailMessage(
    string ToAddress,
    string ToName,
    string Subject,
    string TextBody,
    string HtmlBody,
    IReadOnlyList<EmailAttachment> Attachments,
    string? MessageId = null);

public sealed record EmailAttachment(string FileName, string ContentType, string Content);

// Delivers one email, or throws. Implementations must never log the message
// body, which can hold a single-use link.
public interface IEmailSender
{
    Task SendAsync(EmailMessage message, CancellationToken cancellationToken);
}
