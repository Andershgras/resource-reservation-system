using System.Data;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Options;
using ResourceReservation.Api.Configuration;
using ResourceReservation.Api.Data;

namespace ResourceReservation.Api.Services;

// The SQL Server application locks that serialize changes to a resource's
// bookable time: bookings, moves and closures (ADR 0002).
public class BookingLocks
{
    private readonly AppDbContext _context;
    private readonly SchedulingOptions _schedulingOptions;

    public BookingLocks(AppDbContext context, IOptions<SchedulingOptions> schedulingOptions)
    {
        _context = context;
        _schedulingOptions = schedulingOptions.Value;
    }

    // Opens a transaction and takes the locks in it. Locks are always taken in
    // the same order, the user's before the resource's, so two requests can
    // never each hold one lock while waiting for the other. Pass a null user
    // when only the resource needs locking. The locks are released when the
    // transaction commits, rolls back or is disposed.
    public async Task<BookingLock> AcquireAsync(int? userId, int resourceId)
    {
        // The in-memory test provider has no transactions or locks.
        if (!_context.Database.IsRelational())
        {
            return new BookingLock(true, null);
        }

        var transaction = await _context.Database.BeginTransactionAsync();
        var lockNames = userId is null
            ? [$"reservation:resource:{resourceId}"]
            : new[] { $"reservation:user:{userId}", $"reservation:resource:{resourceId}" };

        try
        {
            foreach (var lockName in lockNames)
            {
                if (!await TryAcquireLockAsync(lockName))
                {
                    await transaction.DisposeAsync();

                    return new BookingLock(false, null);
                }
            }
        }
        catch
        {
            await transaction.DisposeAsync();
            throw;
        }

        return new BookingLock(true, transaction);
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
public sealed record BookingLock(bool Acquired, IDbContextTransaction? Transaction);
