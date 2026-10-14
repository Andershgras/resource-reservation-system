using System.Data;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Options;
using ResourceReservation.Api.Configuration;
using ResourceReservation.Api.Data;

namespace ResourceReservation.Api.Services;

// The SQL Server application locks that serialize changes which must see each
// other: bookings, moves and closures on a resource's time (ADR 0002), and
// changes to user accounts' roles and status (ADR 0010).
public class ApplicationLocks
{
    public const string UserAdministrationLockName = "users:administration";

    private readonly AppDbContext _context;
    private readonly SchedulingOptions _schedulingOptions;

    public ApplicationLocks(AppDbContext context, IOptions<SchedulingOptions> schedulingOptions)
    {
        _context = context;
        _schedulingOptions = schedulingOptions.Value;
    }

    // Opens a transaction and takes the booking locks in it. Locks are always
    // taken in the same order, the user's before the resource's, so two requests
    // can never each hold one lock while waiting for the other. Pass a null user
    // when only the resource needs locking. The locks are released when the
    // transaction commits, rolls back or is disposed.
    public Task<ApplicationLock> AcquireAsync(int? userId, int resourceId)
    {
        return AcquireAsync(userId is null
            ? [$"reservation:resource:{resourceId}"]
            : [$"reservation:user:{userId}", $"reservation:resource:{resourceId}"]);
    }

    // Serializes every change to a user's role or active status, so the check
    // that an active admin remains always sees the other changes.
    public Task<ApplicationLock> AcquireUserAdministrationAsync()
    {
        return AcquireAsync([UserAdministrationLockName]);
    }

    private async Task<ApplicationLock> AcquireAsync(string[] lockNames)
    {
        // The in-memory test provider has no transactions or locks.
        if (!_context.Database.IsRelational())
        {
            return new ApplicationLock(true, null);
        }

        var transaction = await _context.Database.BeginTransactionAsync();

        try
        {
            foreach (var lockName in lockNames)
            {
                if (!await TryAcquireLockAsync(lockName))
                {
                    await transaction.DisposeAsync();

                    return new ApplicationLock(false, null);
                }
            }
        }
        catch
        {
            await transaction.DisposeAsync();
            throw;
        }

        return new ApplicationLock(true, transaction);
    }

    private async Task<bool> TryAcquireLockAsync(string lockName)
    {
        var lockResult = new SqlParameter("@result", SqlDbType.Int)
        {
            Direction = ParameterDirection.Output
        };

        await _context.Database.ExecuteSqlRawAsync(
            """
            EXEC @result = sp_getapplock
                @Resource = @resource,
                @LockMode = 'Exclusive',
                @LockOwner = 'Transaction',
                @LockTimeout = @timeout;
            """,
            new SqlParameter("@resource", lockName),
            new SqlParameter("@timeout", _schedulingOptions.BookingLockTimeoutMilliseconds),
            lockResult);

        // 0 and 1 mean granted. -1 is a timeout and -3 a deadlock victim; both are
        // temporary, so the caller is told to retry. Anything else is a bug.
        var resultCode = (int)lockResult.Value;

        if (resultCode >= 0)
        {
            return true;
        }

        if (resultCode is -1 or -3)
        {
            return false;
        }

        throw new InvalidOperationException(
            $"sp_getapplock failed for '{lockName}' with result code {resultCode}.");
    }
}

// Acquired is false when a lock wasn't granted in time. Transaction is null
// with the in-memory test provider.
public sealed record ApplicationLock(bool Acquired, IDbContextTransaction? Transaction);
