using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using ResourceReservation.Api.Configuration;
using ResourceReservation.Api.Data;
using ResourceReservation.Api.Models;

namespace ResourceReservation.Api.Services;

// Sends the booking emails waiting in the outbox (ADR 0011).
//
// Each email is claimed with a conditional UPDATE that moves NextAttemptAt
// ahead by a lease, so with several API instances only one sends it. If the
// API stops after sending but before recording it, the lease runs out and the
// email is sent again: delivery is at least once, not exactly once. A repeat has the same
// Message-ID and the same calendar UID and SEQUENCE, so calendars don't show
// a duplicate event.
public class EmailOutboxProcessor
{
    public static readonly TimeSpan Lease = TimeSpan.FromMinutes(5);

    private readonly AppDbContext _context;
    private readonly IEmailSender _sender;
    private readonly BookingEmails _bookingEmails;
    private readonly TimeProvider _timeProvider;
    private readonly EmailOutboxOptions _options;
    private readonly ILogger<EmailOutboxProcessor> _logger;

    public EmailOutboxProcessor(
        AppDbContext context,
        IEmailSender sender,
        BookingEmails bookingEmails,
        TimeProvider timeProvider,
        IOptions<EmailOutboxOptions> options,
        ILogger<EmailOutboxProcessor> logger)
    {
        _context = context;
        _sender = sender;
        _bookingEmails = bookingEmails;
        _timeProvider = timeProvider;
        _options = options.Value;
        _logger = logger;
    }

    // Sends every email that is due, oldest first. Returns how many were sent.
    public async Task<int> ProcessDueAsync(CancellationToken cancellationToken)
    {
        var sent = 0;

        while (!cancellationToken.IsCancellationRequested)
        {
            var now = _timeProvider.GetUtcNow();
            var due = await _context.BookingNotifications
                .AsNoTracking()
                .Where(notification =>
                    notification.SentAt == null &&
                    notification.FailedAt == null &&
                    notification.NextAttemptAt <= now)
                .OrderBy(notification => notification.NextAttemptAt)
                .ThenBy(notification => notification.Id)
                .FirstOrDefaultAsync(cancellationToken);

            if (due is null)
            {
                return sent;
            }

            var leaseEnd = now + Lease;
            var claimed = await _context.BookingNotifications
                .Where(notification =>
                    notification.Id == due.Id &&
                    notification.SentAt == null &&
                    notification.FailedAt == null &&
                    notification.NextAttemptAt == due.NextAttemptAt)
                .ExecuteUpdateAsync(setters => setters.SetProperty(notification => notification.NextAttemptAt, leaseEnd),
                    cancellationToken);

            // Another worker claimed it first.
            if (claimed == 0)
            {
                continue;
            }

            if (await TrySendAsync(due, cancellationToken))
            {
                sent++;
            }
        }

        return sent;
    }

    private async Task<bool> TrySendAsync(BookingNotification notification, CancellationToken cancellationToken)
    {
        try
        {
            await _sender.SendAsync(_bookingEmails.Create(notification), cancellationToken);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            await RecordFailureAsync(notification, exception);

            return false;
        }

        var sentAt = _timeProvider.GetUtcNow();
        await _context.BookingNotifications
            .Where(candidate => candidate.Id == notification.Id)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(candidate => candidate.SentAt, sentAt)
                .SetProperty(candidate => candidate.Attempts, candidate => candidate.Attempts + 1)
                .SetProperty(candidate => candidate.LastError, (string?)null),
                CancellationToken.None);
        _logger.LogInformation(
            "Sent booking email {NotificationId} ({Kind}) for reservation {ReservationId}.",
            notification.Id,
            notification.Kind,
            notification.ReservationId);

        return true;
    }

    // Retries later, waiting longer each time, until MaxAttempts. Then the
    // email is given up and logged as an error. The booking itself was
    // committed long before and is never affected.
    private async Task RecordFailureAsync(BookingNotification notification, Exception exception)
    {
        var attempts = notification.Attempts + 1;
        var now = _timeProvider.GetUtcNow();
        var gaveUp = attempts >= _options.MaxAttempts;
        var error = $"{exception.GetType().Name}: {exception.Message}";

        if (error.Length > BookingNotification.LastErrorMaxLength)
        {
            error = error[..BookingNotification.LastErrorMaxLength];
        }

        DateTimeOffset? failedAt = gaveUp ? now : null;
        var nextAttemptAt = now + _options.GetRetryDelay(attempts);

        await _context.BookingNotifications
            .Where(candidate => candidate.Id == notification.Id)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(candidate => candidate.Attempts, attempts)
                .SetProperty(candidate => candidate.LastError, error)
                .SetProperty(candidate => candidate.FailedAt, failedAt)
                .SetProperty(candidate => candidate.NextAttemptAt, nextAttemptAt));

        if (gaveUp)
        {
            _logger.LogError(
                exception,
                "Gave up sending booking email {NotificationId} ({Kind}) for reservation {ReservationId} after {Attempts} attempts.",
                notification.Id,
                notification.Kind,
                notification.ReservationId,
                attempts);
        }
        else
        {
            _logger.LogWarning(
                exception,
                "Sending booking email {NotificationId} ({Kind}) failed on attempt {Attempts}. Retrying at {NextAttemptAt}.",
                notification.Id,
                notification.Kind,
                attempts,
                nextAttemptAt);
        }
    }
}

// Runs the outbox processor every PollIntervalMilliseconds. A failure in one
// round is logged and the next round runs as usual.
public sealed class EmailOutboxWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly EmailOutboxOptions _options;
    private readonly ILogger<EmailOutboxWorker> _logger;

    public EmailOutboxWorker(
        IServiceScopeFactory scopeFactory,
        IOptions<EmailOutboxOptions> options,
        ILogger<EmailOutboxWorker> logger)
    {
        _scopeFactory = scopeFactory;
        _options = options.Value;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(_options.PollIntervalMilliseconds));

        try
        {
            do
            {
                try
                {
                    await using var scope = _scopeFactory.CreateAsyncScope();
                    await scope.ServiceProvider.GetRequiredService<EmailOutboxProcessor>().ProcessDueAsync(stoppingToken);
                }
                catch (Exception exception) when (exception is not OperationCanceledException)
                {
                    _logger.LogError(exception, "The booking email outbox could not be processed. Trying again shortly.");
                }
            }
            while (await timer.WaitForNextTickAsync(stoppingToken));
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
    }
}
