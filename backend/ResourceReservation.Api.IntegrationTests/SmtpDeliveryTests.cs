using System.Net.Http.Json;
using System.Text.Json.Serialization;
using DotNet.Testcontainers.Builders;
using DotNet.Testcontainers.Containers;
using Microsoft.Extensions.Options;
using ResourceReservation.Api.Configuration;
using ResourceReservation.Api.Services;

namespace ResourceReservation.Api.IntegrationTests;

// Real SMTP delivery through MailKit, to a Mailpit container. Mailpit offers
// no TLS, so it also shows that StartTls never falls back to plain text.
public sealed class SmtpDeliveryTests : IClassFixture<SmtpDeliveryTests.MailpitFixture>
{
    private readonly MailpitFixture _mailpit;

    public SmtpDeliveryTests(MailpitFixture mailpit)
    {
        _mailpit = mailpit;
    }

    [Fact]
    public async Task AnEmail_ArrivesWithItsMessageIdAndInvitation()
    {
        var subject = $"Booking confirmed {Guid.NewGuid():N}";
        var sender = CreateSender(SmtpOptions.None, allowInsecure: true);

        await sender.SendAsync(
            new EmailMessage(
                "user@example.com",
                "Test User",
                subject,
                "Your booking is confirmed.",
                "<p>Your booking is confirmed.</p>",
                [new EmailAttachment("booking.ics", "text/calendar; method=REQUEST; charset=UTF-8", "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n")],
                $"<booking-notification-{subject.GetHashCode():x}@example.com>"),
            CancellationToken.None);

        var summary = await _mailpit.FindAsync(subject);
        Assert.NotNull(summary);
        var message = await _mailpit.GetAsync(summary.Id);
        Assert.Equal($"booking-notification-{subject.GetHashCode():x}@example.com", message.MessageId);
        Assert.Equal("no-reply@example.com", message.From.Address);
        Assert.Equal("user@example.com", Assert.Single(message.To).Address);
        Assert.Contains("Your booking is confirmed.", message.Text);
        var invitation = Assert.Single(message.Attachments);
        Assert.Equal("booking.ics", invitation.FileName);
        Assert.StartsWith("text/calendar", invitation.ContentType);
    }

    [Fact]
    public async Task StartTls_ToAServerWithoutTls_FailsInsteadOfSendingInPlainText()
    {
        var subject = $"Must not arrive {Guid.NewGuid():N}";
        var sender = CreateSender(SmtpOptions.StartTls, allowInsecure: false);

        await Assert.ThrowsAnyAsync<Exception>(() => sender.SendAsync(
            new EmailMessage("user@example.com", "Test User", subject, "Text", "<p>HTML</p>", []),
            CancellationToken.None));

        Assert.Null(await _mailpit.FindAsync(subject));
    }

    private SmtpEmailSender CreateSender(string security, bool allowInsecure)
    {
        return new SmtpEmailSender(Options.Create(new EmailOptions
        {
            Delivery = EmailOptions.SmtpDelivery,
            FromAddress = "no-reply@example.com",
            Smtp = new SmtpOptions
            {
                Host = "127.0.0.1",
                Port = _mailpit.SmtpPort,
                Security = security,
                AllowInsecureConnection = allowInsecure
            }
        }));
    }

    public sealed class MailpitFixture : IAsyncLifetime
    {
        // The same image as compose.mailpit.yaml.
        private const string Image = "axllent/mailpit:v1.31.3";

        private readonly IContainer _container = new ContainerBuilder(Image)
            .WithPortBinding(1025, true)
            .WithPortBinding(8025, true)
            .WithWaitStrategy(Wait.ForUnixContainer()
                .UntilHttpRequestIsSucceeded(request => request.ForPort(8025).ForPath("/readyz")))
            .Build();

        private HttpClient _api = null!;

        public int SmtpPort => _container.GetMappedPublicPort(1025);

        public async Task InitializeAsync()
        {
            await _container.StartAsync();
            _api = new HttpClient
            {
                BaseAddress = new Uri($"http://{_container.Hostname}:{_container.GetMappedPublicPort(8025)}")
            };
        }

        public async Task DisposeAsync()
        {
            _api.Dispose();
            await _container.DisposeAsync();
        }

        // Waits briefly for the message, as delivery to Mailpit isn't instant.
        public async Task<MessageSummary?> FindAsync(string subject)
        {
            for (var attempt = 0; attempt < 20; attempt++)
            {
                var list = await _api.GetFromJsonAsync<MessageList>("/api/v1/messages");
                var match = list!.Messages.FirstOrDefault(message => message.Subject == subject);

                if (match is not null)
                {
                    return match;
                }

                await Task.Delay(100);
            }

            return null;
        }

        public async Task<MessageDetail> GetAsync(string id)
        {
            return (await _api.GetFromJsonAsync<MessageDetail>($"/api/v1/message/{id}"))!;
        }
    }

    public sealed record MessageList([property: JsonPropertyName("messages")] List<MessageSummary> Messages);

    public sealed record MessageSummary(
        [property: JsonPropertyName("ID")] string Id,
        [property: JsonPropertyName("Subject")] string Subject);

    public sealed record MessageDetail(
        [property: JsonPropertyName("MessageID")] string MessageId,
        [property: JsonPropertyName("From")] Mailbox From,
        [property: JsonPropertyName("To")] List<Mailbox> To,
        [property: JsonPropertyName("Text")] string Text,
        [property: JsonPropertyName("Attachments")] List<Attachment> Attachments);

    public sealed record Mailbox([property: JsonPropertyName("Address")] string Address);

    public sealed record Attachment(
        [property: JsonPropertyName("FileName")] string FileName,
        [property: JsonPropertyName("ContentType")] string ContentType);
}
