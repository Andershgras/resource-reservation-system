using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ResourceReservation.Api.Data;
using ResourceReservation.Api.Models;
using ResourceReservation.Api.DTOs;

namespace ResourceReservation.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AvailabilitiesController : ControllerBase
{
    private readonly AppDbContext _context;

    public AvailabilitiesController(AppDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<Availability>>> GetAvailabilities()
    {
        return await _context.Availabilities
            .Include(availability => availability.Resource)
            .ToListAsync();
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<Availability>> GetAvailability(int id)
    {
        var availability = await _context.Availabilities
            .Include(availability => availability.Resource)
            .FirstOrDefaultAsync(availability => availability.Id == id);

        if (availability is null)
        {
            return NotFound();
        }

        return Ok(availability);
    }

    [HttpPost]
    public async Task<ActionResult<Availability>> CreateAvailability(CreateAvailabilityDto createAvailabilityDto)
    {
        var resourceExists = await _context.Resources
            .AnyAsync(resource => resource.Id == createAvailabilityDto.ResourceId);

        if (!resourceExists)
        {
            return BadRequest("Resource does not exist.");
        }

        if (createAvailabilityDto.EndTime <= createAvailabilityDto.StartTime)
        {
            return BadRequest("EndTime must be after StartTime.");
        }

        var availability = new Availability
        {
            ResourceId = createAvailabilityDto.ResourceId,
            StartTime = createAvailabilityDto.StartTime,
            EndTime = createAvailabilityDto.EndTime
        };

        _context.Availabilities.Add(availability);
        await _context.SaveChangesAsync();

        return CreatedAtAction(
            nameof(GetAvailability),
            new { id = availability.Id },
            availability);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateAvailability(int id, UpdateAvailabilityDto updateAvailabilityDto)
    {
        var availability = await _context.Availabilities.FindAsync(id);

        if (availability is null)
        {
            return NotFound();
        }

        var resourceExists = await _context.Resources
            .AnyAsync(resource => resource.Id == updateAvailabilityDto.ResourceId);

        if (!resourceExists)
        {
            return BadRequest("Resource does not exist.");
        }

        if (updateAvailabilityDto.EndTime <= updateAvailabilityDto.StartTime)
        {
            return BadRequest("EndTime must be after StartTime.");
        }

        availability.ResourceId = updateAvailabilityDto.ResourceId;
        availability.StartTime = updateAvailabilityDto.StartTime;
        availability.EndTime = updateAvailabilityDto.EndTime;

        await _context.SaveChangesAsync();

        return NoContent();
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteAvailability(int id)
    {
        var availability = await _context.Availabilities.FindAsync(id);

        if (availability is null)
        {
            return NotFound();
        }

        _context.Availabilities.Remove(availability);
        await _context.SaveChangesAsync();

        return NoContent();
    }
}