using System.Data;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Options;
using ResourceReservation.Api.Configuration;
using ResourceReservation.Api.Data;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.Models;

namespace ResourceReservation.Api.Services;

public class ReservationService
{
    public const string ResourceBusyMessage =
        "The resource is busy right now. Please try again in a moment.";

    private readonly AppDbContext _context;
    private readonly AvailabilityService _availabilityService;
    private readonly SchedulingClock _schedulingClock;
    private readonly SchedulingOptions _schedulingOptions;
    private readonly BookingPolicyOptions _bookingPolicyOptions;

    public ReservationService(
        AppDbContext context,
        AvailabilityService availabilityService,
        SchedulingClock schedulingClock,
        IOptions<SchedulingOptions> schedulingOptions,
        IOptions<BookingPolicyOptions> bookingPolicyOptions)
    {
        _context = context;
        _availabilityService = availabilityService;
        _schedulingClock = schedulingClock;
        _schedulingOptions = schedulingOptions.Value;
        _bookingPolicyOptions = bookingPolicyOptions.Value;
    }

    public Task<List<ReservationResponseDto>> GetAllAsync()
    {
        return QueryReservations().ToListAsync();
    }

    public Task<List<ReservationResponseDto>> GetForUserAsync(int userId)
    {
        return QueryReservations(reservation => reservation.UserId == userId).ToListAsync();
    }

    public async Task<ServiceResult<List<ReservationResponseDto>>> GetForResourceAsync(int resourceId)
    {
        if (!await _context.Resources.AnyAsync(resource => resource.Id == resourceId))
        {
            return ServiceError.NotFound("Resource does not exist.");
        }

        return await QueryReservations(reservation => reservation.ResourceId == resourceId).ToListAsync();
    }

    public async Task<ServiceResult<ReservationResponseDto>> GetAsync(int id, CurrentUser currentUser)
    {
        var reservation = await _context.Reservations
            .Include(reservation => reservation.Resource)
            .Include(reservation => reservation.User)
            .Include(reservation => reservation.CancelledBy)
            .FirstOrDefaultAsync(reservation => reservation.Id == id);

        if (reservation is null)
        {
            return ServiceError.NotFound("Reservation not found.");
        }

        if (!CanAccess(reservation, currentUser))
        {
            return ServiceError.Forbidden();
        }

        return ToResponseDto(reservation);
    }

    public async Task<ServiceResult<ReservationResponseDto>> CreateAsync(
        CreateReservationDto request,
        int userId)
    {
        var user = await _context.Users.FindAsync(userId);

        if (user is null)
        {
            return ServiceError.Unauthorized("User does not exist.");
        }

        var resource = await _context.Resources
            .FirstOrDefaultAsync(resource => resource.Id == request.ResourceId);

        if (resource is null)
        {
            return ServiceError.Validation("Resource does not exist.");
        }

        if (!resource.IsActive)
        {
            return ServiceError.Validation("Resource is not active.");
        }

        if (request.EndTime <= request.StartTime)
        {
            return ServiceError.Validation("EndTime must be after StartTime.");
        }

        var policyError = BookingPolicy.For(resource, _bookingPolicyOptions)
            .Check(request.StartTime, request.EndTime, _schedulingClock.GetLocalNow());

        if (policyError is not null)
        {
            return policyError;
        }

        var isWithinAvailability = await _availabilityService.IsWithinAvailabilityAsync(
            request.ResourceId,
            request.StartTime,
            request.EndTime);

        if (!isWithinAvailability)
        {
            return ServiceError.Validation("Resource is not available in this time period.");
        }

        // Serialize bookings per user and per resource, so neither the cap check
        // nor the overlap check can interleave with another booking (ADR 0002).
        var bookingLock = await AcquireBookingLocksAsync(userId, request.ResourceId);

        if (!bookingLock.Acquired)
        {
            return ServiceError.Unavailable(ResourceBusyMessage);
        }

        await using var transaction = bookingLock.Transaction;

        var localNow = _schedulingClock.GetLocalNow();
        var maxActiveReservations = _bookingPolicyOptions.MaxActiveReservationsPerUser;
        var activeReservationCount = await _context.Reservations
            .CountAsync(reservation =>
                reservation.UserId == userId &&
                reservation.Status == ReservationStatuses.Active &&
                reservation.EndTime > localNow);

        if (activeReservationCount >= maxActiveReservations)
        {
            return ServiceError.Validation(
                $"You already have {maxActiveReservations} upcoming bookings, the most allowed. " +
                "Cancel one before booking another.");
        }

        var overlapsExistingReservation = await _context.Reservations
            .AnyAsync(reservation =>
                reservation.ResourceId == request.ResourceId &&
                reservation.Status == ReservationStatuses.Active &&
                request.StartTime < reservation.EndTime &&
                request.EndTime > reservation.StartTime);

        if (overlapsExistingReservation)
        {
            return ServiceError.Conflict("Resource is already reserved in this time period.");
        }

        var reservation = new Reservation
        {
            ResourceId = request.ResourceId,
            UserId = userId,
            StartTime = request.StartTime,
            EndTime = request.EndTime,
            Status = ReservationStatuses.Active,
            CreatedAt = _schedulingClock.GetUtcNow(),
            Resource = resource,
            User = user
        };

        _context.Reservations.Add(reservation);
        await _context.SaveChangesAsync();

        if (transaction is not null)
        {
            await transaction.CommitAsync();
        }

        return ToResponseDto(reservation);
    }

    public async Task<ServiceResult> CancelAsync(int id, CurrentUser currentUser)
    {
        var reservation = await _context.Reservations.FindAsync(id);

        if (reservation is null)
        {
            return ServiceError.NotFound("Reservation not found.");
        }

        if (!CanAccess(reservation, currentUser))
        {
            return ServiceError.Forbidden();
        }

        if (reservation.Status == ReservationStatuses.Cancelled)
        {
            return ServiceError.Validation("Reservation is already cancelled.");
        }

        reservation.Status = ReservationStatuses.Cancelled;
        reservation.CancelledAt = _schedulingClock.GetUtcNow();
        reservation.CancelledByUserId = currentUser.UserId;
        await _context.SaveChangesAsync();

        return ServiceResult.Success;
    }

    // Locks are always taken in the same order, the user's before the resource's,
    // so two requests can never each hold one lock while waiting for the other.
    // Pass a null user when only the resource needs locking.
    private async Task<BookingLock> AcquireBookingLocksAsync(int? userId, int resourceId)
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

    // The lock is owned by the transaction and released on commit or rollback.
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

    private IQueryable<ReservationResponseDto> QueryReservations(
        System.Linq.Expressions.Expression<Func<Reservation, bool>>? filter = null)
    {
        var reservations = _context.Reservations
            .Include(reservation => reservation.Resource)
            .Include(reservation => reservation.User)
            .Include(reservation => reservation.CancelledBy)
            .AsQueryable();

        if (filter is not null)
        {
            reservations = reservations.Where(filter);
        }

        return reservations.Select(reservation => ToResponseDto(reservation));
    }

    private static bool CanAccess(Reservation reservation, CurrentUser currentUser)
    {
        return currentUser.IsAdmin || reservation.UserId == currentUser.UserId;
    }

    private static ReservationResponseDto ToResponseDto(Reservation reservation)
    {
        return new ReservationResponseDto
        {
            Id = reservation.Id,
            ResourceId = reservation.ResourceId,
            ResourceName = reservation.Resource?.Name ?? string.Empty,
            UserId = reservation.UserId,
            UserName = reservation.User?.Name ?? string.Empty,
            UserEmail = reservation.User?.Email ?? string.Empty,
            StartTime = reservation.StartTime,
            EndTime = reservation.EndTime,
            Status = reservation.Status,
            CreatedAt = reservation.CreatedAt,
            UpdatedAt = reservation.UpdatedAt,
            CancelledAt = reservation.CancelledAt,
            CancelledByUserId = reservation.CancelledByUserId,
            CancelledByName = reservation.CancelledBy?.Name,
            Version = Convert.ToBase64String(reservation.Version)
        };
    }

    private sealed record BookingLock(bool Acquired, IDbContextTransaction? Transaction);
}
