using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using ResourceReservation.Api.Configuration;
using ResourceReservation.Api.Data;
using ResourceReservation.Api.Models;

namespace ResourceReservation.Api.Services;

// What one clean-up round deleted.
public sealed record RetentionResult(
    int SentBookingEmails,
    int FailedBookingEmails,
    int Sessions,
    int LinkTokens,
    int UnconfirmedAccounts)
{
    public int Total => SentBookingEmails + FailedBookingEmails + Sessions + LinkTokens + UnconfirmedAccounts;
}

// Deletes data that is no longer needed, after the periods in Retention
// (ADR 0013). Each rule is a DELETE of at most BatchSize rows, repeated until
// nothing is left, so it holds no long locks. A row is only deleted if the
// rule still matches when the statement runs, so several API instances can
// clean up at the same time.
public class DataRetention
{
    private readonly AppDbContext _context;
    private readonly TimeProvider _timeProvider;
    private readonly RetentionOptions _options;

    public DataRetention(AppDbContext context, TimeProvider timeProvider, IOptions<RetentionOptions> options)
    {
        _context = context;
        _timeProvider = timeProvider;
        _options = options.Value;
    }

    public async Task<RetentionResult> RunAsync(CancellationToken cancellationToken)
    {
        var now = _timeProvider.GetUtcNow();

        return new RetentionResult(
            await DeleteSentBookingEmailsAsync(now.AddDays(-_options.SentBookingEmailDays), cancellationToken),
            await DeleteFailedBookingEmailsAsync(now.AddDays(-_options.FailedBookingEmailDays), cancellationToken),
            await DeleteExpiredSessionsAsync(now.AddDays(-_options.ExpiredSessionDays), cancellationToken),
            await DeleteSpentLinkTokensAsync(now.AddDays(-_options.UsedLinkTokenDays), cancellationToken),
            await DeleteUnconfirmedAccountsAsync(now, now.AddDays(-_options.UnconfirmedAccountDays), cancellationToken));
    }

    // The booking keeps its own calendar SEQUENCE, so deleting its emails
    // doesn't affect later invitations.
    private Task<int> DeleteSentBookingEmailsAsync(DateTimeOffset cutoff, CancellationToken cancellationToken)
    {
        return DeleteInBatchesAsync(
            batch => _context.BookingNotifications
                .Where(notification => notification.SentAt != null && notification.SentAt < cutoff)
                .OrderBy(notification => notification.Id)
                .Take(batch),
            cancellationToken);
    }

    private Task<int> DeleteFailedBookingEmailsAsync(DateTimeOffset cutoff, CancellationToken cancellationToken)
    {
        return DeleteInBatchesAsync(
            batch => _context.BookingNotifications
                .Where(notification => notification.FailedAt != null && notification.FailedAt < cutoff)
                .OrderBy(notification => notification.Id)
                .Take(batch),
            cancellationToken);
    }

    // Revoked sessions are kept until they would have expired, like the rest.
    private Task<int> DeleteExpiredSessionsAsync(DateTimeOffset cutoff, CancellationToken cancellationToken)
    {
        return DeleteInBatchesAsync(
            batch => _context.UserSessions
                .Where(session => session.ExpiresAt < cutoff)
                .OrderBy(session => session.Id)
                .Take(batch),
            cancellationToken);
    }

    // Links that were used, or expired, before the cutoff. They can never work
    // again; only their hashes are stored.
    private Task<int> DeleteSpentLinkTokensAsync(DateTimeOffset cutoff, CancellationToken cancellationToken)
    {
        return DeleteInBatchesAsync(
            batch => _context.UserTokens
                .Where(token => (token.UsedAt != null && token.UsedAt < cutoff) || token.ExpiresAt < cutoff)
                .OrderBy(token => token.Id)
                .Take(batch),
            cancellationToken);
    }

    // Accounts registered before the cutoff whose address was never confirmed.
    // Deleted only if nothing that matters refers to them, so referential
    // integrity holds and no important data goes with them:
    // - still unconfirmed and active: an account an admin deactivated is kept
    // - a plain user, never an admin
    // - no reservations they own or cancelled, and no closures they created
    // - no verification or reset link that still works
    // Their remaining rows are throwaway, and go with them through the
    // database's cascades: spent link tokens, email cooldowns and sessions.
    // DataRetentionTests checks that every foreign key to Users is covered.
    private Task<int> DeleteUnconfirmedAccountsAsync(
        DateTimeOffset now,
        DateTimeOffset cutoff,
        CancellationToken cancellationToken)
    {
        return DeleteInBatchesAsync(
            batch => _context.Users
                .Where(user =>
                    !user.IsEmailConfirmed &&
                    user.IsActive &&
                    user.Role == UserRoles.User &&
                    user.CreatedAt != null &&
                    user.CreatedAt < cutoff &&
                    !_context.Reservations.Any(reservation =>
                        reservation.UserId == user.Id || reservation.CancelledByUserId == user.Id) &&
                    !_context.AvailabilityExceptions.Any(closure => closure.CreatedByUserId == user.Id) &&
                    !_context.UserTokens.Any(token =>
                        token.UserId == user.Id && token.UsedAt == null && token.ExpiresAt > now))
                .OrderBy(user => user.Id)
                .Take(batch),
            cancellationToken);
    }

    private async Task<int> DeleteInBatchesAsync<T>(
        Func<int, IQueryable<T>> batchQuery,
        CancellationToken cancellationToken)
    {
        var total = 0;
        int deleted;

        do
        {
            deleted = await batchQuery(_options.BatchSize).ExecuteDeleteAsync(cancellationToken);
            total += deleted;
        }
        while (deleted == _options.BatchSize);

        return total;
    }
}

// Runs the clean-up every Retention:IntervalMinutes, starting a minute after
// startup so it doesn't slow the API down while it starts. A failed round is
// logged, and the next one runs as usual.
public sealed class DataRetentionWorker : BackgroundService
{
    private static readonly TimeSpan FirstRunDelay = TimeSpan.FromMinutes(1);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly RetentionOptions _options;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<DataRetentionWorker> _logger;

    public DataRetentionWorker(
        IServiceScopeFactory scopeFactory,
        IOptions<RetentionOptions> options,
        TimeProvider timeProvider,
        ILogger<DataRetentionWorker> logger)
    {
        _scopeFactory = scopeFactory;
        _options = options.Value;
        _timeProvider = timeProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_options.Enabled)
        {
            return;
        }

        try
        {
            await Task.Delay(FirstRunDelay, _timeProvider, stoppingToken);
            using var timer = new PeriodicTimer(TimeSpan.FromMinutes(_options.IntervalMinutes), _timeProvider);

            do
            {
                try
                {
                    await using var scope = _scopeFactory.CreateAsyncScope();
                    var result = await scope.ServiceProvider.GetRequiredService<DataRetention>().RunAsync(stoppingToken);

                    // Counts only: never addresses or other personal data.
                    if (result.Total > 0)
                    {
                        _logger.LogInformation(
                            "Clean-up deleted {SentBookingEmails} sent and {FailedBookingEmails} failed booking emails, " +
                            "{Sessions} expired sessions, {LinkTokens} spent links and {UnconfirmedAccounts} unconfirmed accounts.",
                            result.SentBookingEmails,
                            result.FailedBookingEmails,
                            result.Sessions,
                            result.LinkTokens,
                            result.UnconfirmedAccounts);
                    }
                }
                catch (Exception exception) when (exception is not OperationCanceledException)
                {
                    _logger.LogError(exception, "The clean-up failed. It runs again at the next interval.");
                }
            }
            while (await timer.WaitForNextTickAsync(stoppingToken));
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
    }
}
