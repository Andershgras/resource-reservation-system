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

    public ReservationService(
        AppDbContext context,
        AvailabilityService availabilityService,
        SchedulingClock schedulingClock,
        IOptions<SchedulingOptions> schedulingOptions)
    {
        _context = context;
        _availabilityService = availabilityService;
        _schedulingClock = schedulingClock;
        _schedulingOptions = schedulingOptions.Value;
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
        if (!await _context.Users.AnyAsync(user => user.Id == userId))
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

        if (request.StartTime < _schedulingClock.GetLocalNow())
        {
            return ServiceError.Validation("Reservations must start in the future.");
        }

        var isWithinAvailability = await _availabilityService.IsWithinAvailabilityAsync(
            request.ResourceId,
            request.StartTime,
            request.EndTime);

        if (!isWithinAvailability)
        {
            return ServiceError.Validation("Resource is not available in this time period.");
        }

        // Serialize bookings per resource so the overlap check and the insert
        // cannot interleave with another request for the same resource (ADR 0002).
        var bookingLock = await AcquireResourceBookingLockAsync(request.ResourceId);

        if (!bookingLock.Acquired)
        {
            return ServiceError.Unavailable(ResourceBusyMessage);
        }

        await using var transaction = bookingLock.Transaction;

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
            Resource = resource
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
        await _context.SaveChangesAsync();

        return ServiceResult.Success;
    }

    private async Task<BookingLock> AcquireResourceBookingLockAsync(int resourceId)
    {
        // The in-memory test provider has no transactions or locks.
        if (!_context.Database.IsRelational())
        {
            return new BookingLock(true, null);
        }

        var transaction = await _context.Database.BeginTransactionAsync();
        var lockResult = new SqlParameter("@result", SqlDbType.Int)
        {
            Direction = ParameterDirection.Output
        };

        // The lock is owned by the transaction and released on commit or rollback.
        await _context.Database.ExecuteSqlRawAsync(
            """
            EXEC @result = sp_getapplock
                @Resource = @resource,
                @LockMode = 'Exclusive',
                @LockOwner = 'Transaction',
                @LockTimeout = @timeout;
            """,
            new SqlParameter("@resource", $"reservation:resource:{resourceId}"),
            new SqlParameter("@timeout", _schedulingOptions.BookingLockTimeoutMilliseconds),
            lockResult);

        // 0 and 1 mean granted. -1 is a timeout and -3 a deadlock victim; both are
        // temporary, so the caller is told to retry. Anything else is a bug.
        var resultCode = (int)lockResult.Value;

        if (resultCode >= 0)
        {
            return new BookingLock(true, transaction);
        }

        await transaction.DisposeAsync();

        if (resultCode is -1 or -3)
        {
            return new BookingLock(false, null);
        }

        throw new InvalidOperationException(
            $"sp_getapplock failed for resource {resourceId} with result code {resultCode}.");
    }

    private IQueryable<ReservationResponseDto> QueryReservations(
        System.Linq.Expressions.Expression<Func<Reservation, bool>>? filter = null)
    {
        var reservations = _context.Reservations.Include(reservation => reservation.Resource).AsQueryable();

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
            StartTime = reservation.StartTime,
            EndTime = reservation.EndTime,
            Status = reservation.Status
        };
    }

    private sealed record BookingLock(bool Acquired, IDbContextTransaction? Transaction);
}
