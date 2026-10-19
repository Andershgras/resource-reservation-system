using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Options;
using MimeKit;
using ResourceReservation.Api.Configuration;

namespace ResourceReservation.Api.Services;

// Sends email through an SMTP server with MailKit, which Microsoft recommends
// over System.Net.Mail's SmtpClient. Each email gets its own connection: the
// volume is small, and a broken connection can't affect the next email.
//
// TLS is required unless Email:Smtp:Security is None, which configuration
// validation only allows for a local test mail catcher (EmailOptions). A
// failure throws, so the caller's retries apply: the outbox for booking
// emails, the dispatcher for account emails. The message body, which can hold
// a single-use link, is never logged.
public sealed class SmtpEmailSender : IEmailSender
{
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(30);

    private readonly EmailOptions _options;

    public SmtpEmailSender(IOptions<EmailOptions> options)
    {
        _options = options.Value;
    }

    public async Task SendAsync(EmailMessage message, CancellationToken cancellationToken)
    {
        using var mime = CreateMimeMessage(message);
        using var client = new SmtpClient { Timeout = (int)Timeout.TotalMilliseconds };
        var smtp = _options.Smtp;
        var security = smtp.Security switch
        {
            SmtpOptions.SslOnConnect => SecureSocketOptions.SslOnConnect,
            SmtpOptions.None => SecureSocketOptions.None,
            // Fails if the server doesn't offer STARTTLS, rather than sending in plain text.
            _ => SecureSocketOptions.StartTls
        };

        await client.ConnectAsync(smtp.Host, smtp.Port, security, cancellationToken);

        if (!string.IsNullOrEmpty(smtp.Username))
        {
            await client.AuthenticateAsync(smtp.Username, smtp.Password, cancellationToken);
        }

        await client.SendAsync(mime, cancellationToken);
        await client.DisconnectAsync(quit: true, cancellationToken);
    }

    public MimeMessage CreateMimeMessage(EmailMessage message)
    {
        var mime = new MimeMessage();
        mime.From.Add(new MailboxAddress(_options.FromName, _options.FromAddress));
        mime.To.Add(new MailboxAddress(message.ToName, message.ToAddress));
        mime.Subject = message.Subject;

        // The same ID on every attempt, so a mail client can recognise a
        // duplicate after a retry. MimeKit adds the angle brackets itself.
        if (message.MessageId is not null)
        {
            mime.MessageId = message.MessageId.Trim('<', '>');
        }

        var body = new BodyBuilder
        {
            TextBody = message.TextBody,
            HtmlBody = message.HtmlBody
        };

        foreach (var attachment in message.Attachments)
        {
            body.Attachments.Add(
                attachment.FileName,
                System.Text.Encoding.UTF8.GetBytes(attachment.Content),
                ContentType.Parse(attachment.ContentType));
        }

        mime.Body = body.ToMessageBody();

        return mime;
    }
}
