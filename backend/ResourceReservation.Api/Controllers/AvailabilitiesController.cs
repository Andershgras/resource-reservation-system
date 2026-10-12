using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ResourceReservation.Api.Data;
using ResourceReservation.Api.Models;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.Services;
using Microsoft.AspNetCore.Authorization;

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
    public async Task<ActionResult<IEnumerable<AvailabilityResponseDto>>> GetAvailabilities()
    {
        return await _context.Availabilities
            .Include(availability => availability.Resource)
            .Select(availability => ToAvailabilityResponseDto(availability))
            .ToListAsync();
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<AvailabilityResponseDto>> GetAvailability(int id)
    {
        var availability = await _context.Availabilities
            .Include(availability => availability.Resource)
            .FirstOrDefaultAsync(availability => availability.Id == id);

        if (availability is null)
        {
            return this.ToErrorResult(ServiceError.NotFound("Availability not found."));
        }

        return Ok(ToAvailabilityResponseDto(availability));
    }

    [HttpPost]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<AvailabilityResponseDto>> CreateAvailability(CreateAvailabilityDto createAvailabilityDto)
    {
        var resource = await _context.Resources
            .FirstOrDefaultAsync(resource => resource.Id == createAvailabilityDto.ResourceId);

        if (resource is null)
        {
            return this.ToErrorResult(ServiceError.Validation("Resource does not exist."));
        }

        if (createAvailabilityDto.EndTime <= createAvailabilityDto.StartTime)
        {
            return this.ToErrorResult(ServiceError.Validation("EndTime must be after StartTime."));
        }

        if (await HasOverlappingAvailability(
            createAvailabilityDto.ResourceId,
            createAvailabilityDto.StartTime,
            createAvailabilityDto.EndTime))
        {
            return this.ToErrorResult(ServiceError.Validation(
                "Availability overlaps an existing window for this resource."));
        }

        var availability = new Availability
        {
            ResourceId = createAvailabilityDto.ResourceId,
            StartTime = createAvailabilityDto.StartTime,
            EndTime = createAvailabilityDto.EndTime,
            Resource = resource
        };

        _context.Availabilities.Add(availability);
        await _context.SaveChangesAsync();

        return CreatedAtAction(
            nameof(GetAvailability),
            new { id = availability.Id },
            ToAvailabilityResponseDto(availability));
    }

    [HttpPut("{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> UpdateAvailability(int id, UpdateAvailabilityDto updateAvailabilityDto)
    {
        var availability = await _context.Availabilities.FindAsync(id);

        if (availability is null)
        {
            return this.ToErrorResult(ServiceError.NotFound("Availability not found."));
        }

        var resourceExists = await _context.Resources
            .AnyAsync(resource => resource.Id == updateAvailabilityDto.ResourceId);

        if (!resourceExists)
        {
            return this.ToErrorResult(ServiceError.Validation("Resource does not exist."));
        }

        if (updateAvailabilityDto.EndTime <= updateAvailabilityDto.StartTime)
        {
            return this.ToErrorResult(ServiceError.Validation("EndTime must be after StartTime."));
        }

        if (await HasOverlappingAvailability(
            updateAvailabilityDto.ResourceId,
            updateAvailabilityDto.StartTime,
            updateAvailabilityDto.EndTime,
            id))
        {
            return this.ToErrorResult(ServiceError.Validation(
                "Availability overlaps an existing window for this resource."));
        }

        availability.ResourceId = updateAvailabilityDto.ResourceId;
        availability.StartTime = updateAvailabilityDto.StartTime;
        availability.EndTime = updateAvailabilityDto.EndTime;

        await _context.SaveChangesAsync();

        return NoContent();
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> DeleteAvailability(int id)
    {
        var availability = await _context.Availabilities.FindAsync(id);

        if (availability is null)
        {
            return this.ToErrorResult(ServiceError.NotFound("Availability not found."));
        }

        _context.Availabilities.Remove(availability);
        await _context.SaveChangesAsync();

        return NoContent();
    }

    private static AvailabilityResponseDto ToAvailabilityResponseDto(Availability availability)
    {
        return new AvailabilityResponseDto
        {
            Id = availability.Id,
            ResourceId = availability.ResourceId,
            ResourceName = availability.Resource?.Name ?? string.Empty,
            StartTime = availability.StartTime,
            EndTime = availability.EndTime
        };
    }

    private Task<bool> HasOverlappingAvailability(
        int resourceId,
        DateTime startTime,
        DateTime endTime,
        int? ignoredAvailabilityId = null)
    {
        return _context.Availabilities
            .AnyAsync(availability =>
                availability.ResourceId == resourceId &&
                availability.Id != ignoredAvailabilityId &&
                startTime < availability.EndTime &&
                endTime > availability.StartTime);
    }
}
