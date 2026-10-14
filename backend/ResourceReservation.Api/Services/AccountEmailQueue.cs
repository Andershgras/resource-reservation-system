using System.Threading.Channels;

namespace ResourceReservation.Api.Services;

// Account emails (verification links, password reset links and notices)
// waiting to be sent, in memory only (ADR 0011). These can carry single-use
// links, which must never be stored or logged, so they don't use the database
// outbox. A restart loses what is still queued; the user can ask again.
//
// Queuing is instant whatever the email, so a request takes about as long
// whether or not it sends one, which keeps account enumeration hard.
public sealed class AccountEmailQueue
{
    public const int Capacity = 1000;

    private readonly Channel<AccountEmail> _channel = Channel.CreateBounded<AccountEmail>(
        new BoundedChannelOptions(Capacity) { SingleReader = true, FullMode = BoundedChannelFullMode.Wait });

    private readonly ILogger<AccountEmailQueue> _logger;

    public AccountEmailQueue(ILogger<AccountEmailQueue> logger)
    {
        _logger = logger;
    }

    public ChannelReader<AccountEmail> Reader => _channel.Reader;

    // Never waits. A full queue drops the email and says so in the log, without
    // the email's content.
    public void Enqueue(AccountEmail email)
    {
        if (!_channel.Writer.TryWrite(email))
        {
            _logger.LogError(
                "Account email queue is full. Dropped a {Kind} email for user {UserId}.",
                email.Kind,
                email.UserId);
        }
    }
}

// Kind and UserId are for logs; the message itself is never logged.
public sealed record AccountEmail(string Kind, int UserId, EmailMessage Message);

// Sends queued account emails, retrying a few times. A failure is logged with
// the kind and user, never the link.
public sealed class AccountEmailDispatcher : BackgroundService
{
    public static readonly TimeSpan[] RetryDelays = [TimeSpan.FromSeconds(2), TimeSpan.FromSeconds(10)];

    private readonly AccountEmailQueue _queue;
    private readonly IEmailSender _sender;
    private readonly ILogger<AccountEmailDispatcher> _logger;

    public AccountEmailDispatcher(
        AccountEmailQueue queue,
        IEmailSender sender,
        ILogger<AccountEmailDispatcher> logger)
    {
        _queue = queue;
        _sender = sender;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await foreach (var email in _queue.Reader.ReadAllAsync(stoppingToken))
            {
                await SendWithRetriesAsync(email, stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
    }

    private async Task SendWithRetriesAsync(AccountEmail email, CancellationToken stoppingToken)
    {
        for (var attempt = 0; ; attempt++)
        {
            try
            {
                await _sender.SendAsync(email.Message, stoppingToken);
                _logger.LogInformation("Sent a {Kind} email to user {UserId}.", email.Kind, email.UserId);

                return;
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                if (attempt >= RetryDelays.Length)
                {
                    // Only the exception's type: its message could quote the email.
                    _logger.LogError(
                        "Could not send a {Kind} email to user {UserId} after {Attempts} attempts ({ErrorType}). " +
                        "The user can ask for another.",
                        email.Kind,
                        email.UserId,
                        attempt + 1,
                        exception.GetType().Name);

                    return;
                }

                _logger.LogWarning(
                    "Sending a {Kind} email to user {UserId} failed ({ErrorType}). Retrying.",
                    email.Kind,
                    email.UserId,
                    exception.GetType().Name);
                await Task.Delay(RetryDelays[attempt], stoppingToken);
            }
        }
    }
}
