using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ResourceReservation.Api.Data;
using ResourceReservation.Api.Models;

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
    public async Task<ActionResult<Availability>> CreateAvailability(Availability availability)
    {
        var resourceExists = await _context.Resources
            .AnyAsync(resource => resource.Id == availability.ResourceId);

        if (!resourceExists)
        {
            return BadRequest("Resource does not exist.");
        }

        if (availability.EndTime <= availability.StartTime)
        {
            return BadRequest("EndTime must be after StartTime.");
        }

        _context.Availabilities.Add(availability);
        await _context.SaveChangesAsync();

        return CreatedAtAction(
            nameof(GetAvailability),
            new { id = availability.Id },
            availability);
    }
}