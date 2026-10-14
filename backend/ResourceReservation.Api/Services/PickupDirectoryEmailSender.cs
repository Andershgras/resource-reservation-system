using System.Net.Mail;
using System.Net.Mime;
using System.Text;
using Microsoft.Extensions.Options;
using ResourceReservation.Api.Configuration;

namespace ResourceReservation.Api.Services;

// For development: writes each email as an .eml file instead of sending it, so
// no mail server or paid provider is needed. Open the files in any mail client.
// The folder holds working links, so it is git-ignored and only for local use.
public sealed class PickupDirectoryEmailSender : IEmailSender
{
    private readonly EmailOptions _options;
    private readonly string _directory;

    public PickupDirectoryEmailSender(IOptions<EmailOptions> options, IWebHostEnvironment environment)
    {
        _options = options.Value;
        _directory = Path.GetFullPath(Path.Combine(environment.ContentRootPath, _options.PickupDirectory!));
    }

    public async Task SendAsync(EmailMessage message, CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(_directory);

        using var mail = new MailMessage
        {
            From = new MailAddress(_options.FromAddress, _options.FromName),
            Subject = message.Subject,
            SubjectEncoding = Encoding.UTF8,
            BodyEncoding = Encoding.UTF8,
            Body = message.TextBody,
            IsBodyHtml = false
        };
        mail.To.Add(new MailAddress(message.ToAddress, message.ToName));
        mail.AlternateViews.Add(AlternateView.CreateAlternateViewFromString(
            message.HtmlBody,
            Encoding.UTF8,
            MediaTypeNames.Text.Html));

        if (message.MessageId is not null)
        {
            mail.Headers.Add("Message-ID", message.MessageId);
        }

        foreach (var attachment in message.Attachments)
        {
            mail.Attachments.Add(new Attachment(
                new MemoryStream(Encoding.UTF8.GetBytes(attachment.Content)),
                attachment.FileName,
                attachment.ContentType));
        }

        using var client = new SmtpClient
        {
            DeliveryMethod = SmtpDeliveryMethod.SpecifiedPickupDirectory,
            PickupDirectoryLocation = _directory
        };

        await client.SendMailAsync(mail, cancellationToken);
    }
}
