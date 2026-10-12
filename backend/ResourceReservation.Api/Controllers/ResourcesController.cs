using Microsoft.AspNetCore.Mvc;
using ResourceReservation.Api.Models;
using Microsoft.EntityFrameworkCore;
using ResourceReservation.Api.Data;
using Microsoft.AspNetCore.Authorization;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.Services;

namespace ResourceReservation.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ResourcesController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly AvailabilityService _availabilityService;

    public ResourcesController(AppDbContext context, AvailabilityService availabilityService)
    {
        _context = context;
        _availabilityService = availabilityService;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<ResourceResponseDto>>> GetResources()
    {
        return await _context.Resources
            .Select(resource => ToResourceResponseDto(resource))
            .ToListAsync();
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<ResourceResponseDto>> GetResource(int id)
    {
        var resource = await _context.Resources.FindAsync(id);

        if (resource is null)
        {
            return this.ToErrorResult(ServiceError.NotFound("Resource not found."));
        }

        return Ok(ToResourceResponseDto(resource));
    }

    [HttpGet("{id}/schedule")]
    public async Task<ActionResult<ResourceScheduleResponseDto>> GetResourceSchedule(
        int id,
        [FromQuery] DateOnly? from,
        [FromQuery] DateOnly? to)
    {
        var result = await _availabilityService.GetScheduleAsync(id, from, to);

        return result.IsSuccess ? Ok(result.Value) : this.ToErrorResult(result.Error);
    }

    [HttpPost]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<ResourceResponseDto>> CreateResource(CreateResourceDto createResourceDto)
    {
        if (string.IsNullOrWhiteSpace(createResourceDto.Name))
        {
            return this.ToErrorResult(ServiceError.Validation("Name is required."));
        }

        var resource = new Resource
        {
            Name = createResourceDto.Name.Trim(),
            Description = NormalizeOptionalText(createResourceDto.Description),
            Location = NormalizeOptionalText(createResourceDto.Location),
            IsActive = true
        };

        _context.Resources.Add(resource);
        await _context.SaveChangesAsync();

        return CreatedAtAction(
            nameof(GetResource),
            new { id = resource.Id },
            ToResourceResponseDto(resource));
    }

    [HttpPut("{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> UpdateResource(int id, UpdateResourceDto updateResourceDto)
    {
        if (string.IsNullOrWhiteSpace(updateResourceDto.Name))
        {
            return this.ToErrorResult(ServiceError.Validation("Name is required."));
        }

        var resource = await _context.Resources.FindAsync(id);

        if (resource is null)
        {
            return this.ToErrorResult(ServiceError.NotFound("Resource not found."));
        }

        resource.Name = updateResourceDto.Name.Trim();
        resource.Description = NormalizeOptionalText(updateResourceDto.Description);
        resource.Location = NormalizeOptionalText(updateResourceDto.Location);
        resource.IsActive = updateResourceDto.IsActive;

        await _context.SaveChangesAsync();

        return NoContent();
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> DeleteResource(int id)
    {
        var resource = await _context.Resources.FindAsync(id);

        if (resource is null)
        {
            return this.ToErrorResult(ServiceError.NotFound("Resource not found."));
        }

        var hasReservationHistory = await _context.Reservations
            .AnyAsync(reservation => reservation.ResourceId == id);

        if (hasReservationHistory)
        {
            return this.ToErrorResult(ServiceError.Validation(
                "Resource has reservation history and cannot be deleted. Mark it inactive instead."));
        }

        _context.Resources.Remove(resource);
        await _context.SaveChangesAsync();

        return NoContent();
    }

    private static ResourceResponseDto ToResourceResponseDto(Resource resource)
    {
        return new ResourceResponseDto
        {
            Id = resource.Id,
            Name = resource.Name,
            Description = resource.Description,
            Location = resource.Location,
            IsActive = resource.IsActive
        };
    }

    private static string? NormalizeOptionalText(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value.Trim();
    }
}
