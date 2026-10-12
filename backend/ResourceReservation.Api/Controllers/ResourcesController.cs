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
    private readonly SchedulingClock _schedulingClock;

    public ResourcesController(
        AppDbContext context,
        AvailabilityService availabilityService,
        SchedulingClock schedulingClock)
    {
        _context = context;
        _availabilityService = availabilityService;
        _schedulingClock = schedulingClock;
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
            return NotFound(ApiError("Resource not found."));
        }

        return Ok(ToResourceResponseDto(resource));
    }

    [HttpGet("{id}/schedule")]
    public async Task<ActionResult<ResourceScheduleResponseDto>> GetResourceSchedule(
        int id,
        [FromQuery] DateOnly? from,
        [FromQuery] DateOnly? to)
    {
        if (from is null || to is null)
        {
            return BadRequest(ApiError("From and to dates are required."));
        }

        if (to < from)
        {
            return BadRequest(ApiError("To date must be on or after from date."));
        }

        var resource = await _context.Resources.FindAsync(id);

        if (resource is null)
        {
            return NotFound(ApiError("Resource not found."));
        }

        if (!resource.IsActive)
        {
            return BadRequest(ApiError("Resource is not active."));
        }

        var rangeStart = from.Value.ToDateTime(TimeOnly.MinValue);
        var rangeEnd = to.Value.AddDays(1).ToDateTime(TimeOnly.MinValue);
        var reservedSlots = await GetReservedSlots(id, rangeStart, rangeEnd);
        var availabilityIntervals = await _availabilityService.GetAvailabilityIntervalsAsync(
            id,
            from.Value,
            to.Value);
        var bookableSlots = AvailabilityService.RemoveTimeBefore(
            AvailabilityService.SubtractReservedSlots(
                availabilityIntervals,
                reservedSlots.Select(slot => new TimeRange(slot.StartTime, slot.EndTime))),
            GetNextWholeMinute(_schedulingClock.GetLocalNow()));

        return Ok(new ResourceScheduleResponseDto
        {
            ResourceId = resource.Id,
            ResourceName = resource.Name,
            FromDate = from.Value,
            ToDate = to.Value,
            BookableSlots = bookableSlots
                .Select(slot => new BookableSlotResponseDto
                {
                    StartTime = slot.StartTime,
                    EndTime = slot.EndTime
                })
                .ToList(),
            ReservedSlots = reservedSlots
                .Select(slot => new ReservedSlotResponseDto
                {
                    ReservationId = slot.Id,
                    StartTime = slot.StartTime,
                    EndTime = slot.EndTime
                })
                .ToList()
        });
    }

    [HttpPost]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<ResourceResponseDto>> CreateResource(CreateResourceDto createResourceDto)
    {
        if (string.IsNullOrWhiteSpace(createResourceDto.Name))
        {
            return BadRequest(ApiError("Name is required."));
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
            return BadRequest(ApiError("Name is required."));
        }

        var resource = await _context.Resources.FindAsync(id);

        if (resource is null)
        {
            return NotFound(ApiError("Resource not found."));
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
            return NotFound(ApiError("Resource not found."));
        }

        var hasReservationHistory = await _context.Reservations
            .AnyAsync(reservation => reservation.ResourceId == id);

        if (hasReservationHistory)
        {
            return BadRequest(ApiError(
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

    private async Task<List<ReservedTimeRange>> GetReservedSlots(
        int resourceId,
        DateTime rangeStart,
        DateTime rangeEnd)
    {
        return await _context.Reservations
            .Where(reservation =>
                reservation.ResourceId == resourceId &&
                reservation.Status == ReservationStatuses.Active &&
                reservation.StartTime < rangeEnd &&
                reservation.EndTime > rangeStart)
            .OrderBy(reservation => reservation.StartTime)
            .Select(reservation => new ReservedTimeRange(
                reservation.Id,
                reservation.StartTime < rangeStart ? rangeStart : reservation.StartTime,
                reservation.EndTime > rangeEnd ? rangeEnd : reservation.EndTime))
            .ToListAsync();
    }

    private static DateTime GetNextWholeMinute(DateTime value)
    {
        var wholeMinute = new DateTime(
            value.Year,
            value.Month,
            value.Day,
            value.Hour,
            value.Minute,
            0);

        return wholeMinute == value ? wholeMinute : wholeMinute.AddMinutes(1);
    }

    private static string? NormalizeOptionalText(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value.Trim();
    }

    private static ApiErrorResponseDto ApiError(string message)
    {
        return new ApiErrorResponseDto { Message = message };
    }

    private sealed record ReservedTimeRange(
        int Id,
        DateTime StartTime,
        DateTime EndTime);
}
