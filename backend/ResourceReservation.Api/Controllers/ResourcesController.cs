using Microsoft.AspNetCore.Mvc;
using ResourceReservation.Api.Models;
using Microsoft.EntityFrameworkCore;
using ResourceReservation.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Options;
using ResourceReservation.Api.Configuration;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.Services;

namespace ResourceReservation.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ResourcesController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly AvailabilityService _availabilityService;
    private readonly ReservationService _reservationService;
    private readonly BookingPolicyOptions _bookingPolicyOptions;

    public ResourcesController(
        AppDbContext context,
        AvailabilityService availabilityService,
        ReservationService reservationService,
        IOptions<BookingPolicyOptions> bookingPolicyOptions)
    {
        _context = context;
        _availabilityService = availabilityService;
        _reservationService = reservationService;
        _bookingPolicyOptions = bookingPolicyOptions.Value;
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

    // Anonymous, except that leaving out a reservation that is being moved
    // needs its owner or an admin.
    [HttpGet("{id}/schedule")]
    public async Task<ActionResult<ResourceScheduleResponseDto>> GetResourceSchedule(
        int id,
        [FromQuery] DateOnly? from,
        [FromQuery] DateOnly? to,
        [FromQuery] int? excludeReservationId)
    {
        if (excludeReservationId is not null)
        {
            if (User.GetCurrentUser() is not { } currentUser)
            {
                return this.AuthenticationRequired();
            }

            var reservation = await _reservationService.GetAsync(excludeReservationId.Value, currentUser);

            if (!reservation.IsSuccess)
            {
                return this.ToErrorResult(reservation.Error);
            }

            if (reservation.Value.ResourceId != id)
            {
                return this.ToErrorResult(ServiceError.Validation("The reservation is for a different resource."));
            }
        }

        var result = await _availabilityService.GetScheduleAsync(id, from, to, excludeReservationId);

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
            IsActive = true,
            MinDurationMinutes = createResourceDto.MinDurationMinutes,
            MaxDurationMinutes = createResourceDto.MaxDurationMinutes,
            MinLeadTimeMinutes = createResourceDto.MinLeadTimeMinutes,
            MaxAdvanceDays = createResourceDto.MaxAdvanceDays
        };

        if (!HasRulesThatCanBeMet(resource))
        {
            return ValidationProblem();
        }

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
        resource.MinDurationMinutes = updateResourceDto.MinDurationMinutes;
        resource.MaxDurationMinutes = updateResourceDto.MaxDurationMinutes;
        resource.MinLeadTimeMinutes = updateResourceDto.MinLeadTimeMinutes;
        resource.MaxAdvanceDays = updateResourceDto.MaxAdvanceDays;

        if (!HasRulesThatCanBeMet(resource))
        {
            return ValidationProblem();
        }

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
            IsActive = resource.IsActive,
            MinDurationMinutes = resource.MinDurationMinutes,
            MaxDurationMinutes = resource.MaxDurationMinutes,
            MinLeadTimeMinutes = resource.MinLeadTimeMinutes,
            MaxAdvanceDays = resource.MaxAdvanceDays
        };
    }

    // Checks the rules in force, so an override can't contradict a default or
    // leave a resource that nothing could ever be booked on.
    private bool HasRulesThatCanBeMet(Resource resource)
    {
        var policy = BookingPolicy.For(resource, _bookingPolicyOptions);

        if (policy.CanBeMet)
        {
            return true;
        }

        if (policy.MinDurationMinutes <= policy.MaxDurationMinutes)
        {
            // The notice and the shortest booking don't fit within the days ahead.
            var field = resource.MaxAdvanceDays is not null
                ? nameof(Resource.MaxAdvanceDays)
                : resource.MinLeadTimeMinutes is not null
                    ? nameof(Resource.MinLeadTimeMinutes)
                    : nameof(Resource.MinDurationMinutes);
            ModelState.AddModelError(field, "Allow more days ahead, or less notice, so the shortest booking fits.");

            return false;
        }

        var message = resource.MaxDurationMinutes is null
            ? $"The minimum duration can't be longer than the default maximum of {policy.MaxDurationMinutes} minutes."
            : "The maximum duration can't be shorter than the minimum duration.";
        ModelState.AddModelError(
            resource.MaxDurationMinutes is null ? nameof(Resource.MinDurationMinutes) : nameof(Resource.MaxDurationMinutes),
            message);

        return false;
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
