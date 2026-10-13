using Microsoft.EntityFrameworkCore;
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

    public const string ReservationChangedMessage =
        "This reservation was changed by someone else. Reload it and try again.";

    private readonly AppDbContext _context;
    private readonly AvailabilityService _availabilityService;
    private readonly SchedulingClock _schedulingClock;
    private readonly BookingLocks _bookingLocks;
    private readonly BookingPolicyOptions _bookingPolicyOptions;

    public ReservationService(
        AppDbContext context,
        AvailabilityService availabilityService,
        SchedulingClock schedulingClock,
        BookingLocks bookingLocks,
        IOptions<BookingPolicyOptions> bookingPolicyOptions)
    {
        _context = context;
        _availabilityService = availabilityService;
        _schedulingClock = schedulingClock;
        _bookingLocks = bookingLocks;
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

        // Serialize bookings per user and per resource, so neither the cap check
        // nor the overlap check can interleave with another booking (ADR 0002).
        var bookingLock = await _bookingLocks.AcquireAsync(userId, request.ResourceId);

        if (!bookingLock.Acquired)
        {
            return ServiceError.Unavailable(ResourceBusyMessage);
        }

        await using var transaction = bookingLock.Transaction;

        // Under the lock, so a closure saved meanwhile is either seen here or
        // reports this booking as affected (ADR 0009).
        var isWithinAvailability = await _availabilityService.IsWithinAvailabilityAsync(
            request.ResourceId,
            request.StartTime,
            request.EndTime);

        if (!isWithinAvailability)
        {
            return ServiceError.Validation("Resource is not available in this time period.");
        }

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

    // Without a version, the cancellation is still rejected if the reservation
    // changes between reading and saving it.
    public async Task<ServiceResult> CancelAsync(int id, CurrentUser currentUser, string? version = null)
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

        if (version is not null && !MatchesVersion(reservation, version))
        {
            return ServiceError.Conflict(ReservationChangedMessage);
        }

        if (reservation.Status == ReservationStatuses.Cancelled)
        {
            return ServiceError.Validation("Reservation is already cancelled.");
        }

        reservation.Status = ReservationStatuses.Cancelled;
        reservation.CancelledAt = _schedulingClock.GetUtcNow();
        reservation.CancelledByUserId = currentUser.UserId;

        return await TrySaveChangesAsync()
            ? ServiceResult.Success
            : ServiceError.Conflict(ReservationChangedMessage);
    }

    // Moves an upcoming reservation to a new time on the same resource. The new
    // time is checked like a new booking, except that the reservation doesn't
    // overlap itself and doesn't count again towards the user's cap.
    public async Task<ServiceResult<ReservationResponseDto>> RescheduleAsync(
        int id,
        RescheduleReservationDto request,
        CurrentUser currentUser)
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

        if (!MatchesVersion(reservation, request.Version))
        {
            return ServiceError.Conflict(ReservationChangedMessage);
        }

        if (reservation.Status == ReservationStatuses.Cancelled)
        {
            return ServiceError.Validation("Cancelled reservations can't be moved.");
        }

        var localNow = _schedulingClock.GetLocalNow();

        if (reservation.StartTime <= localNow)
        {
            return ServiceError.Validation("Reservations that have started can't be moved.");
        }

        var resource = reservation.Resource!;

        if (!resource.IsActive)
        {
            return ServiceError.Validation("Resource is not active.");
        }

        if (request.EndTime <= request.StartTime)
        {
            return ServiceError.Validation("EndTime must be after StartTime.");
        }

        var policyError = BookingPolicy.For(resource, _bookingPolicyOptions)
            .Check(request.StartTime, request.EndTime, localNow);

        if (policyError is not null)
        {
            return policyError;
        }

        // Moving doesn't change how many bookings the user holds, so only the
        // resource is locked.
        var bookingLock = await _bookingLocks.AcquireAsync(null, reservation.ResourceId);

        if (!bookingLock.Acquired)
        {
            return ServiceError.Unavailable(ResourceBusyMessage);
        }

        await using var transaction = bookingLock.Transaction;

        // Under the lock, as when booking.
        var isWithinAvailability = await _availabilityService.IsWithinAvailabilityAsync(
            reservation.ResourceId,
            request.StartTime,
            request.EndTime);

        if (!isWithinAvailability)
        {
            return ServiceError.Validation("Resource is not available in this time period.");
        }

        var overlapsAnotherReservation = await _context.Reservations
            .AnyAsync(other =>
                other.Id != reservation.Id &&
                other.ResourceId == reservation.ResourceId &&
                other.Status == ReservationStatuses.Active &&
                request.StartTime < other.EndTime &&
                request.EndTime > other.StartTime);

        if (overlapsAnotherReservation)
        {
            return ServiceError.Conflict("Resource is already reserved in this time period.");
        }

        reservation.StartTime = request.StartTime;
        reservation.EndTime = request.EndTime;
        reservation.UpdatedAt = _schedulingClock.GetUtcNow();

        if (!await TrySaveChangesAsync())
        {
            return ServiceError.Conflict(ReservationChangedMessage);
        }

        if (transaction is not null)
        {
            await transaction.CommitAsync();
        }

        return ToResponseDto(reservation);
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

    private static bool MatchesVersion(Reservation reservation, string version)
    {
        var buffer = new byte[version.Length];

        return Convert.TryFromBase64String(version, buffer, out var length) &&
            buffer.AsSpan(0, length).SequenceEqual(reservation.Version);
    }

    // The rowversion read with the reservation is part of the UPDATE's WHERE
    // clause, so a change saved by someone else in between makes this fail.
    private async Task<bool> TrySaveChangesAsync()
    {
        try
        {
            await _context.SaveChangesAsync();

            return true;
        }
        catch (DbUpdateConcurrencyException)
        {
            return false;
        }
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
}
