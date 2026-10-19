using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Logging;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.IntegrationTests.Infrastructure;
using ResourceReservation.Api.Services;

namespace ResourceReservation.Api.IntegrationTests;

// Links and their tokens never reach the logs, even at the most detailed
// level, and failed account emails are logged without them (ADR 0011).
public class AccountEmailLoggingTests : ApiTestBase
{
    private const string Email = "logged@integration.test";
    private const string Password = "Password123";

    public AccountEmailLoggingTests(ApiFixture fixture)
        : base(fixture)
    {
    }

    [Fact]
    public async Task TheWholeAccountJourney_LogsNoLinkOrToken()
    {
        var logs = new CapturingLoggerProvider();
        await using var factory = Fixture.Factory.WithWebHostBuilder(builder =>
            builder.ConfigureLogging(logging => logging.SetMinimumLevel(LogLevel.Trace).AddProvider(logs)));
        var client = factory.CreateBrowserClient();

        await client.PostAsJsonAsync("/api/auth/register", new RegisterUserDto
        {
            Name = "Logged User",
            Email = Email,
            Password = Password
        });
        var verification = TestEmailSink.TokenFrom((await TestEmailSink.Instance.WaitForAsync(Email))[0]);
        // A wrong password first, so the failure path is logged too.
        await client.PostAsJsonAsync("/api/auth/verify-email", new VerifyEmailDto { Token = verification, Password = "Wrong123456" });
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsJsonAsync("/api/auth/verify-email",
            new VerifyEmailDto { Token = verification, Password = Password })).StatusCode);
        await client.PostAsJsonAsync("/api/auth/forgot-password", new AccountEmailRequestDto { Email = Email });
        var reset = TestEmailSink.TokenFrom((await TestEmailSink.Instance.WaitForAsync(
            Email, message => message.Subject == "Reset your password"))[0]);
        await client.PostAsJsonAsync("/api/auth/reset-password/check", new PasswordResetTokenDto { Token = reset });
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsJsonAsync("/api/auth/reset-password",
            new ResetPasswordDto { Token = reset, Password = "NewPassword456" })).StatusCode);
        // A used link, so the refusal is logged too.
        await client.PostAsJsonAsync("/api/auth/reset-password", new ResetPasswordDto { Token = reset, Password = "Again123456" });
        await TestEmailSink.Instance.WaitForAsync(Email, message => message.Subject == "Your password was changed");

        Assert.NotEmpty(logs.Messages);
        foreach (var secret in new[]
        {
            verification,
            reset,
            UserTokenService.HashToken(verification),
            UserTokenService.HashToken(reset),
            "#token=",
            "verify-email#",
            "reset-password#"
        })
        {
            Assert.DoesNotContain(logs.Messages, message => message.Contains(secret, StringComparison.OrdinalIgnoreCase));
        }

        // The sends themselves are logged, by kind and user only.
        Assert.Contains(logs.Messages, message => message.Contains($"Sent a {AccountEmails.VerificationKind} email to user"));
    }

    [Fact]
    public async Task AnEmailThatCantBeSent_IsLoggedAsAnError_WithoutItsLink()
    {
        var logs = new CapturingLoggerProvider();
        await using var factory = Fixture.Factory.WithWebHostBuilder(builder =>
            builder.ConfigureLogging(logging => logging.AddProvider(logs)));
        TestEmailSink.Instance.FailWith = message => new InvalidOperationException($"Could not deliver: {message.TextBody}");

        await factory.CreateBrowserClient().PostAsJsonAsync("/api/auth/register", new RegisterUserDto
        {
            Name = "Unlucky User",
            Email = Email,
            Password = Password
        });

        // Three attempts, 2 s and 10 s apart.
        string? error = null;

        for (var attempt = 0; attempt < 300 && error is null; attempt++)
        {
            error = logs.Messages.FirstOrDefault(message => message.Contains("Could not send a"));
            await Task.Delay(50);
        }

        Assert.NotNull(error);
        Assert.Contains("after 3 attempts (InvalidOperationException)", error);
        Assert.DoesNotContain(logs.Messages, message => message.Contains("#token=") || message.Contains("Could not deliver"));
    }
}
