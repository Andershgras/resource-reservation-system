using System.Collections.Concurrent;
using System.Text.RegularExpressions;
using ResourceReservation.Api.Services;

namespace ResourceReservation.Api.IntegrationTests.Infrastructure;

// Catches every email any test host sends, instead of delivering it. Shared by
// all hosts, because a background worker in any of them may send an email.
// Cleared before each test.
public sealed partial class TestEmailSink : IEmailSender
{
    public static readonly TestEmailSink Instance = new();

    private readonly ConcurrentQueue<EmailMessage> _messages = new();

    // Set to make sending fail, for retry tests.
    public Func<EmailMessage, Exception?>? FailWith { get; set; }

    public IReadOnlyList<EmailMessage> Messages => [.. _messages];

    public Task SendAsync(EmailMessage message, CancellationToken cancellationToken)
    {
        if (FailWith?.Invoke(message) is { } exception)
        {
            throw exception;
        }

        _messages.Enqueue(message);

        return Task.CompletedTask;
    }

    public void Clear()
    {
        _messages.Clear();
        FailWith = null;
    }

    // Waits for the emails to one address that match, up to a few seconds.
    public async Task<List<EmailMessage>> WaitForAsync(
        string toAddress,
        Func<EmailMessage, bool>? match = null,
        int count = 1)
    {
        for (var attempt = 0; attempt < 100; attempt++)
        {
            var found = Messages
                .Where(message => message.ToAddress == toAddress && (match?.Invoke(message) ?? true))
                .ToList();

            if (found.Count >= count)
            {
                return found;
            }

            await Task.Delay(50);
        }

        throw new TimeoutException($"Expected {count} matching email(s) to {toAddress}, got fewer.");
    }

    // Gives queued emails time to arrive, for checking that none did.
    public static Task SettleAsync() => Task.Delay(500);

    // The token from a link such as https://app/reset-password#token=abc.
    public static string TokenFrom(EmailMessage message)
    {
        return TokenPattern().Match(message.TextBody).Groups[1].Value;
    }

    [GeneratedRegex(@"#token=([A-Za-z0-9_-]+)")]
    private static partial Regex TokenPattern();
}
