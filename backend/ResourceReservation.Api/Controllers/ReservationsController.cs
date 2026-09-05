using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ResourceReservation.Api.Data;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.Models;

namespace ResourceReservation.Api.Controllers;

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

        return Ok(reservation);
    }

    [HttpPost]
    public async Task<ActionResult<Reservation>> CreateReservation(CreateReservationDto createReservationDto)
    {
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
            UserId = createReservationDto.UserId,
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
}