using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using ResourceReservation.Api.Data;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.Models;
using ResourceReservation.Api.Services;
using Microsoft.AspNetCore.Authorization;
using System.Security.Claims;

namespace ResourceReservation.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/[controller]")]
public class ReservationsController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly AvailabilityService _availabilityService;
    private readonly SchedulingClock _schedulingClock;

    public ReservationsController(
        AppDbContext context,
        AvailabilityService availabilityService,
        SchedulingClock schedulingClock)
    {
        _context = context;
        _availabilityService = availabilityService;
        _schedulingClock = schedulingClock;
    }

    [HttpGet]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<IEnumerable<ReservationResponseDto>>> GetReservations()
    {
        return await _context.Reservations
            .Include(reservation => reservation.Resource)
            .Select(reservation => ToReservationResponseDto(reservation))
            .ToListAsync();
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<ReservationResponseDto>> GetReservation(int id)
    {
        var reservation = await _context.Reservations
            .Include(reservation => reservation.Resource)
            .FirstOrDefaultAsync(reservation => reservation.Id == id);

        if (reservation is null)
        {
            return NotFound(ApiError("Reservation not found."));
        }

        if (!User.IsInRole("Admin") && reservation.UserId != GetCurrentUserId())
        {
            return Forbidden();
        }

        return Ok(ToReservationResponseDto(reservation));
    }

    [HttpGet("me")]
    public async Task<ActionResult<IEnumerable<ReservationResponseDto>>> GetMyReservations()
    {
        var currentUserId = GetCurrentUserId();

        if (currentUserId is null)
        {
            return Unauthorized(ApiError("Authentication is required."));
        }

        return await _context.Reservations
            .Include(reservation => reservation.Resource)
            .Where(reservation => reservation.UserId == currentUserId)
            .Select(reservation => ToReservationResponseDto(reservation))
            .ToListAsync();
    }

    [HttpPost]
    public async Task<ActionResult<ReservationResponseDto>> CreateReservation(CreateReservationDto createReservationDto)
    {
        var currentUserId = GetCurrentUserId();

        if (currentUserId is null)
        {
            return Unauthorized(ApiError("Authentication is required."));
        }

        var userExists = await _context.Users
            .AnyAsync(user => user.Id == currentUserId);

        if (!userExists)
        {
            return Unauthorized(ApiError("User does not exist."));
        }

        var resource = await _context.Resources
            .FirstOrDefaultAsync(resource => resource.Id == createReservationDto.ResourceId);

        if (resource is null)
        {
            return BadRequest(ApiError("Resource does not exist."));
        }

        if (!resource.IsActive)
        {
            return BadRequest(ApiError("Resource is not active."));
        }

        if (createReservationDto.EndTime <= createReservationDto.StartTime)
        {
            return BadRequest(ApiError("EndTime must be after StartTime."));
        }

        if (createReservationDto.StartTime < _schedulingClock.GetLocalNow())
        {
            return BadRequest(ApiError("Reservations must start in the future."));
        }

        var isInsideAvailability = await _availabilityService.IsWithinAvailabilityAsync(
            createReservationDto.ResourceId,
            createReservationDto.StartTime,
            createReservationDto.EndTime);

        if (!isInsideAvailability)
        {
            return BadRequest(ApiError("Resource is not available in this time period."));
        }

        // Serialize bookings per resource so the overlap check and the insert
        // cannot interleave with another request for the same resource.
        await using var transaction = await BeginResourceBookingLockAsync(
            createReservationDto.ResourceId);

        var overlapsExistingReservation = await _context.Reservations
            .AnyAsync(reservation =>
                reservation.ResourceId == createReservationDto.ResourceId &&
                reservation.Status == ReservationStatuses.Active &&
                createReservationDto.StartTime < reservation.EndTime &&
                createReservationDto.EndTime > reservation.StartTime);

        if (overlapsExistingReservation)
        {
            return Conflict(ApiError("Resource is already reserved in this time period."));
        }

        var reservation = new Reservation
        {
            ResourceId = createReservationDto.ResourceId,
            UserId = currentUserId.Value,
            StartTime = createReservationDto.StartTime,
            EndTime = createReservationDto.EndTime,
            Status = ReservationStatuses.Active,
            Resource = resource
        };

        _context.Reservations.Add(reservation);
        await _context.SaveChangesAsync();

        if (transaction is not null)
        {
            await transaction.CommitAsync();
        }

        return CreatedAtAction(
            nameof(GetReservation),
            new { id = reservation.Id },
            ToReservationResponseDto(reservation));
    }

    [HttpPut("{id}/cancel")]
    public async Task<IActionResult> CancelReservation(int id)
    {
        var reservation = await _context.Reservations.FindAsync(id);

        if (reservation is null)
        {
            return NotFound(ApiError("Reservation not found."));
        }

        if (!User.IsInRole("Admin") && reservation.UserId != GetCurrentUserId())
        {
            return Forbidden();
        }

        if (reservation.Status == ReservationStatuses.Cancelled)
        {
            return BadRequest(ApiError("Reservation is already cancelled."));
        }

        reservation.Status = ReservationStatuses.Cancelled;

        await _context.SaveChangesAsync();

        return NoContent();
    }

    [HttpGet("resource/{resourceId}")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<IEnumerable<ReservationResponseDto>>> GetReservationsByResource(int resourceId)
    {
        var resourceExists = await _context.Resources
            .AnyAsync(resource => resource.Id == resourceId);

        if (!resourceExists)
        {
            return NotFound(ApiError("Resource does not exist."));
        }

        return await _context.Reservations
            .Include(reservation => reservation.Resource)
            .Where(reservation => reservation.ResourceId == resourceId)
            .Select(reservation => ToReservationResponseDto(reservation))
            .ToListAsync();
    }

    [HttpGet("user/{userId}")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<IEnumerable<ReservationResponseDto>>> GetReservationsByUser(int userId)
    {
        return await _context.Reservations
            .Include(reservation => reservation.Resource)
            .Where(reservation => reservation.UserId == userId)
            .Select(reservation => ToReservationResponseDto(reservation))
            .ToListAsync();
    }

    private int? GetCurrentUserId()
    {
        var userIdValue = User.FindFirstValue(ClaimTypes.NameIdentifier);

        if (!int.TryParse(userIdValue, out var userId))
        {
            return null;
        }

        return userId;
    }

    private async Task<IDbContextTransaction?> BeginResourceBookingLockAsync(int resourceId)
    {
        // The in-memory test provider has no transactions or locks.
        if (!_context.Database.IsRelational())
        {
            return null;
        }

        var transaction = await _context.Database.BeginTransactionAsync();
        var lockName = $"reservation:resource:{resourceId}";

        // The lock is owned by the transaction and released on commit or rollback.
        await _context.Database.ExecuteSqlInterpolatedAsync($"""
            DECLARE @result int;
            EXEC @result = sp_getapplock
                @Resource = {lockName},
                @LockMode = 'Exclusive',
                @LockOwner = 'Transaction',
                @LockTimeout = 10000;
            IF @result < 0
                THROW 50000, 'Could not acquire the reservation lock for this resource.', 1;
            """);

        return transaction;
    }

    private static ReservationResponseDto ToReservationResponseDto(Reservation reservation)
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

    private ObjectResult Forbidden()
    {
        return StatusCode(
            StatusCodes.Status403Forbidden,
            ApiError("You do not have permission to access this resource."));
    }

    private static ApiErrorResponseDto ApiError(string message)
    {
        return new ApiErrorResponseDto { Message = message };
    }
}
