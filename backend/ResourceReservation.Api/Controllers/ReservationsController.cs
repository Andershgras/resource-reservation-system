using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ResourceReservation.Api.Data;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.Models;
using Microsoft.AspNetCore.Authorization;
using System.Security.Claims;

namespace ResourceReservation.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/[controller]")]
public class ReservationsController : ControllerBase
{
    private readonly AppDbContext _context;

    public ReservationsController(AppDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<IEnumerable<Reservation>>> GetReservations()
    {
        return await _context.Reservations
            .Include(reservation => reservation.Resource)
            .ToListAsync();
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<Reservation>> GetReservation(int id)
    {
        var reservation = await _context.Reservations
            .Include(reservation => reservation.Resource)
            .FirstOrDefaultAsync(reservation => reservation.Id == id);

        if (reservation is null)
        {
            return NotFound();
        }

        if (!User.IsInRole("Admin") && reservation.UserId != GetCurrentUserId())
        {
            return Forbid();
        }

        return Ok(reservation);
    }

    [HttpGet("me")]
    public async Task<ActionResult<IEnumerable<Reservation>>> GetMyReservations()
    {
        var currentUserId = GetCurrentUserId();

        if (currentUserId is null)
        {
            return Unauthorized();
        }

        return await _context.Reservations
            .Include(reservation => reservation.Resource)
            .Where(reservation => reservation.UserId == currentUserId)
            .ToListAsync();
    }

    [HttpPost]
    public async Task<ActionResult<Reservation>> CreateReservation(CreateReservationDto createReservationDto)
    {
        var currentUserId = GetCurrentUserId();

        if (currentUserId is null)
        {
            return Unauthorized();
        }

        var userExists = await _context.Users
            .AnyAsync(user => user.Id == currentUserId);

        if (!userExists)
        {
            return Unauthorized("User does not exist.");
        }

        var resource = await _context.Resources
            .FirstOrDefaultAsync(resource => resource.Id == createReservationDto.ResourceId);

        if (resource is null)
        {
            return BadRequest("Resource does not exist.");
        }

        if (!resource.IsActive)
        {
            return BadRequest("Resource is not active.");
        }

        if (createReservationDto.EndTime <= createReservationDto.StartTime)
        {
            return BadRequest("EndTime must be after StartTime.");
        }

        var isInsideAvailability = await _context.Availabilities
            .AnyAsync(availability =>
                availability.ResourceId == createReservationDto.ResourceId &&
                createReservationDto.StartTime >= availability.StartTime &&
                createReservationDto.EndTime <= availability.EndTime);

        if (!isInsideAvailability)
        {
            return BadRequest("Resource is not available in this time period.");
        }

        var overlapsExistingReservation = await _context.Reservations
            .AnyAsync(reservation =>
                reservation.ResourceId == createReservationDto.ResourceId &&
                reservation.Status == "Active" &&
                createReservationDto.StartTime < reservation.EndTime &&
                createReservationDto.EndTime > reservation.StartTime);

        if (overlapsExistingReservation)
        {
            return BadRequest("Resource is already reserved in this time period.");
        }

        var reservation = new Reservation
        {
            ResourceId = createReservationDto.ResourceId,
            UserId = currentUserId.Value,
            StartTime = createReservationDto.StartTime,
            EndTime = createReservationDto.EndTime,
            Status = "Active"
        };

        _context.Reservations.Add(reservation);
        await _context.SaveChangesAsync();

        return CreatedAtAction(
            nameof(GetReservation),
            new { id = reservation.Id },
            reservation);
    }
    [HttpPut("{id}/cancel")]
    public async Task<IActionResult> CancelReservation(int id)
    {
        var reservation = await _context.Reservations.FindAsync(id);

        if (reservation is null)
        {
            return NotFound();
        }

        if (!User.IsInRole("Admin") && reservation.UserId != GetCurrentUserId())
        {
            return Forbid();
        }

        if (reservation.Status == "Cancelled")
        {
            return BadRequest("Reservation is already cancelled.");
        }

        reservation.Status = "Cancelled";

        await _context.SaveChangesAsync();

        return NoContent();
    }

    [HttpGet("resource/{resourceId}")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<IEnumerable<Reservation>>> GetReservationsByResource(int resourceId)
    {
        var resourceExists = await _context.Resources
            .AnyAsync(resource => resource.Id == resourceId);

        if (!resourceExists)
        {
            return NotFound("Resource does not exist.");
        }

        return await _context.Reservations
            .Include(reservation => reservation.Resource)
            .Where(reservation => reservation.ResourceId == resourceId)
            .ToListAsync();
    }

    [HttpGet("user/{userId}")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<IEnumerable<Reservation>>> GetReservationsByUser(int userId)
    {
        return await _context.Reservations
            .Include(reservation => reservation.Resource)
            .Where(reservation => reservation.UserId == userId)
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
}
