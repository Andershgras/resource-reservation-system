using System.ComponentModel.DataAnnotations;
using Microsoft.Extensions.Options;
using MimeKit;
using ResourceReservation.Api.Configuration;
using ResourceReservation.Api.Services;

namespace ResourceReservation.Api.Tests;

public class SmtpEmailTests
{
    [Theory]
    [InlineData("localhost")]
    [InlineData("mailpit")]
    [InlineData("127.0.0.1")]
    [InlineData("10.1.2.3")]
    [InlineData("172.20.0.5")]
    [InlineData("192.168.1.10")]
    [InlineData("::1")]
    [InlineData("fd00::5")]
    public void LocalHosts_AreRecognised(string host)
    {
        Assert.True(SmtpOptions.IsLocalHost(host));
    }

    [Theory]
    [InlineData("smtp.example.com")]
    [InlineData("mail.provider.net")]
    [InlineData("8.8.8.8")]
    [InlineData("172.32.0.1")]
    [InlineData("2001:db8::1")]
    public void OtherHosts_AreNotLocal(string host)
    {
        Assert.False(SmtpOptions.IsLocalHost(host));
    }

    [Fact]
    public void StartTlsToARealServer_IsValid()
    {
        Assert.Empty(Validate(new SmtpOptions
        {
            Host = "smtp.example.com",
            Username = "app",
            Password = "secret"
        }));
    }

    [Fact]
    public void PlainText_NeedsExplicitPermission()
    {
        var errors = Validate(new SmtpOptions { Host = "mailpit", Port = 1025, Security = SmtpOptions.None });

        Assert.Contains(errors, error => error.Contains("Email:Smtp:AllowInsecureConnection=true"));
    }

    [Fact]
    public void PlainText_IsAllowedForALocalMailCatcherWhenPermitted()
    {
        Assert.Empty(Validate(new SmtpOptions
        {
            Host = "mailpit",
            Port = 1025,
            Security = SmtpOptions.None,
            AllowInsecureConnection = true
        }));
    }

    [Fact]
    public void PlainText_IsRefusedForARemoteHostEvenWhenPermitted()
    {
        var errors = Validate(new SmtpOptions
        {
            Host = "smtp.example.com",
            Security = SmtpOptions.None,
            AllowInsecureConnection = true
        });

        Assert.Contains(errors, error => error.Contains("only allowed for a local host"));
    }

    [Fact]
    public void PlainText_RefusesAPassword()
    {
        var errors = Validate(new SmtpOptions
        {
            Host = "mailpit",
            Security = SmtpOptions.None,
            AllowInsecureConnection = true,
            Username = "app",
            Password = "secret"
        });

        Assert.Contains(errors, error => error.Contains("would be sent unencrypted"));
    }

    [Theory]
    [InlineData(null, "secret")]
    [InlineData("app", null)]
    public void UsernameAndPassword_GoTogether(string? username, string? password)
    {
        var errors = Validate(new SmtpOptions { Host = "smtp.example.com", Username = username, Password = password });

        Assert.Contains(errors, error => error.Contains("must be set together"));
    }

    [Theory]
    [InlineData(null, 587, SmtpOptions.StartTls, "Email:Smtp:Host is required")]
    [InlineData("smtp.example.com", 0, SmtpOptions.StartTls, "Email:Smtp:Port must be between 1 and 65535.")]
    [InlineData("smtp.example.com", 587, "Tls", "Email:Smtp:Security must be StartTls, SslOnConnect or None.")]
    public void InvalidSettings_AreReported(string? host, int port, string security, string expected)
    {
        var errors = Validate(new SmtpOptions { Host = host, Port = port, Security = security });

        Assert.Contains(errors, error => error.Contains(expected));
    }

    [Fact]
    public void SmtpDelivery_ChecksTheSmtpSettings()
    {
        var options = new EmailOptions
        {
            Delivery = EmailOptions.SmtpDelivery,
            FromAddress = "no-reply@example.com"
        };

        var errors = options.Validate(new ValidationContext(options)).Select(result => result.ErrorMessage);

        Assert.Contains("Email:Smtp:Host is required when Email:Delivery is Smtp.", errors);
    }

    [Fact]
    public void TheMimeMessage_KeepsTheMessageIdBodiesAndInvitation()
    {
        var sender = new SmtpEmailSender(Options.Create(new EmailOptions
        {
            Delivery = EmailOptions.SmtpDelivery,
            FromAddress = "no-reply@example.com",
            FromName = "Resource Reservation"
        }));
        var message = new EmailMessage(
            "user@example.com",
            "Test User",
            "Booking confirmed",
            "Plain text",
            "<p>HTML</p>",
            [new EmailAttachment("booking.ics", "text/calendar; method=REQUEST; charset=UTF-8", "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n")],
            "<booking-notification-7@example.com>");

        using var mime = sender.CreateMimeMessage(message);

        Assert.Equal("booking-notification-7@example.com", mime.MessageId);
        var from = Assert.IsType<MailboxAddress>(Assert.Single(mime.From));
        var to = Assert.IsType<MailboxAddress>(Assert.Single(mime.To));
        Assert.Equal(("Resource Reservation", "no-reply@example.com"), (from.Name, from.Address));
        Assert.Equal(("Test User", "user@example.com"), (to.Name, to.Address));
        Assert.Equal("Plain text", mime.TextBody);
        Assert.Equal("<p>HTML</p>", mime.HtmlBody);
        var invitation = Assert.IsAssignableFrom<MimePart>(Assert.Single(mime.Attachments));
        Assert.Equal("booking.ics", invitation.FileName);
        Assert.Equal("text/calendar", invitation.ContentType.MimeType);
        Assert.Equal("REQUEST", invitation.ContentType.Parameters["method"]);
    }

    private static List<string> Validate(SmtpOptions options)
    {
        return options.Validate().Select(result => result.ErrorMessage!).ToList();
    }
}
