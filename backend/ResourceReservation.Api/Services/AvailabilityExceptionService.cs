using Microsoft.EntityFrameworkCore;
using ResourceReservation.Api.Data;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.Models;

namespace ResourceReservation.Api.Services;

// Closures: time a resource can't be booked, such as a holiday (ADR 0009).
// Existing reservations inside a closure are never cancelled automatically.
public class AvailabilityExceptionService
{
    private readonly AppDbContext _context;
    private readonly ReservationService _reservationService;
    private readonly ApplicationLocks _locks;
    private readonly SchedulingClock _schedulingClock;

    public AvailabilityExceptionService(
        AppDbContext context,
        ReservationService reservationService,
        ApplicationLocks locks,
        SchedulingClock schedulingClock)
    {
        _context = context;
        _reservationService = reservationService;
        _locks = locks;
        _schedulingClock = schedulingClock;
    }

    public async Task<List<AvailabilityExceptionResponseDto>> GetAllAsync(int? resourceId)
    {
        var closures = await _context.AvailabilityExceptions
            .Include(closure => closure.Resource)
            .Include(closure => closure.CreatedBy)
            .Where(closure => resourceId == null || closure.ResourceId == resourceId)
            .OrderBy(closure => closure.StartTime)
            .ThenBy(closure => closure.Id)
            .ToListAsync();

        return closures.Select(ToResponseDto).ToList();
    }

    // The active reservations a closure would cover, before it is created.
    public async Task<ServiceResult<List<ReservationResponseDto>>> PreviewAsync(
        CreateAvailabilityExceptionDto request)
    {
        var error = await ValidateAsync(request);

        if (error is not null)
        {
            return error;
        }

        return await _reservationService.GetActiveOverlappingAsync(
            request.ResourceId,
            request.StartTime,
            request.EndTime);
    }

    // Created under the resource's booking lock, the same one bookings and
    // moves take. A booking either finishes first, and is listed as affected,
    // or starts after, and sees the closure. The list returned is therefore
    // complete, even if it differs from the preview.
    public async Task<ServiceResult<AvailabilityExceptionCreatedDto>> CreateAsync(
        CreateAvailabilityExceptionDto request,
        int adminUserId)
    {
        var error = await ValidateAsync(request);

        if (error is not null)
        {
            return error;
        }

        var bookingLock = await _locks.AcquireAsync(null, request.ResourceId);

        if (!bookingLock.Acquired)
        {
            return ServiceError.Unavailable(ReservationService.ResourceBusyMessage);
        }

        await using var transaction = bookingLock.Transaction;

        var closure = new AvailabilityException
        {
            ResourceId = request.ResourceId,
            StartTime = request.StartTime,
            EndTime = request.EndTime,
            Reason = request.Reason.Trim(),
            CreatedAt = _schedulingClock.GetUtcNow(),
            CreatedByUserId = adminUserId
        };

        _context.AvailabilityExceptions.Add(closure);
        await _context.SaveChangesAsync();

        var affectedReservations = await _reservationService.GetActiveOverlappingAsync(
            closure.ResourceId,
            closure.StartTime,
            closure.EndTime);

        if (transaction is not null)
        {
            await transaction.CommitAsync();
        }

        await _context.Entry(closure).Reference(item => item.Resource).LoadAsync();
        await _context.Entry(closure).Reference(item => item.CreatedBy).LoadAsync();

        return new AvailabilityExceptionCreatedDto
        {
            Closure = ToResponseDto(closure),
            AffectedReservations = affectedReservations
        };
    }

    // Removes only this closure. Others that overlap it keep closing their time.
    public async Task<ServiceResult> DeleteAsync(int id)
    {
        var closure = await _context.AvailabilityExceptions.FindAsync(id);

        if (closure is null)
        {
            return ServiceError.NotFound("Closure not found.");
        }

        _context.AvailabilityExceptions.Remove(closure);
        await _context.SaveChangesAsync();

        return ServiceResult.Success;
    }

    private async Task<ServiceError?> ValidateAsync(CreateAvailabilityExceptionDto request)
    {
        if (!await _context.Resources.AnyAsync(resource => resource.Id == request.ResourceId))
        {
            return ServiceError.Validation("Resource does not exist.");
        }

        if (string.IsNullOrWhiteSpace(request.Reason))
        {
            return ServiceError.Validation("Enter a reason, such as a holiday or maintenance.");
        }

        if (request.EndTime <= request.StartTime)
        {
            return ServiceError.Validation("EndTime must be after StartTime.");
        }

        if (_schedulingClock.CheckTimesExist(request.StartTime, request.EndTime) is { } timeError)
        {
            return timeError;
        }

        if (request.EndTime <= _schedulingClock.GetLocalNow())
        {
            return ServiceError.Validation("Closures must end in the future.");
        }

        return null;
    }

    private static AvailabilityExceptionResponseDto ToResponseDto(AvailabilityException closure)
    {
        return new AvailabilityExceptionResponseDto
        {
            Id = closure.Id,
            ResourceId = closure.ResourceId,
            ResourceName = closure.Resource?.Name ?? string.Empty,
            StartTime = closure.StartTime,
            EndTime = closure.EndTime,
            Reason = closure.Reason,
            CreatedAt = closure.CreatedAt,
            CreatedByName = closure.CreatedBy?.Name
        };
    }
}
