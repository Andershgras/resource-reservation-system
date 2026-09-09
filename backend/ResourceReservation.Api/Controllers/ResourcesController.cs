using Microsoft.AspNetCore.Mvc;
using ResourceReservation.Api.Models;
using Microsoft.EntityFrameworkCore;
using ResourceReservation.Api.Data;
using Microsoft.AspNetCore.Authorization;
using ResourceReservation.Api.DTOs;

namespace ResourceReservation.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ResourcesController : ControllerBase
{
    private readonly AppDbContext _context;

    public ResourcesController(AppDbContext context)
    {
        _context = context;
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
        var availabilityIntervals = await GetAvailabilityIntervals(
            id,
            rangeStart,
            rangeEnd,
            from.Value,
            to.Value);
        var bookableSlots = SubtractReservedSlots(availabilityIntervals, reservedSlots);

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

    private async Task<List<TimeRange>> GetAvailabilityIntervals(
        int resourceId,
        DateTime rangeStart,
        DateTime rangeEnd,
        DateOnly from,
        DateOnly to)
    {
        var oneOffAvailability = await _context.Availabilities
            .Where(availability =>
                availability.ResourceId == resourceId &&
                availability.StartTime < rangeEnd &&
                availability.EndTime > rangeStart)
            .Select(availability => new TimeRange(
                availability.StartTime < rangeStart ? rangeStart : availability.StartTime,
                availability.EndTime > rangeEnd ? rangeEnd : availability.EndTime))
            .ToListAsync();

        var rules = await _context.AvailabilityRules
            .Where(rule => rule.ResourceId == resourceId)
            .ToListAsync();
        var recurringAvailability = new List<TimeRange>();

        for (var date = from; date <= to; date = date.AddDays(1))
        {
            foreach (var rule in rules.Where(rule => rule.DayOfWeek == date.DayOfWeek))
            {
                recurringAvailability.Add(new TimeRange(
                    date.ToDateTime(rule.StartTime),
                    date.ToDateTime(rule.EndTime)));
            }
        }

        return MergeIntervals(oneOffAvailability.Concat(recurringAvailability));
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

    private static List<TimeRange> MergeIntervals(IEnumerable<TimeRange> intervals)
    {
        var sortedIntervals = intervals
            .Where(interval => interval.EndTime > interval.StartTime)
            .OrderBy(interval => interval.StartTime)
            .ToList();
        var mergedIntervals = new List<TimeRange>();

        foreach (var interval in sortedIntervals)
        {
            var previousInterval = mergedIntervals.LastOrDefault();

            if (previousInterval is null || interval.StartTime > previousInterval.EndTime)
            {
                mergedIntervals.Add(interval);
                continue;
            }

            if (interval.EndTime > previousInterval.EndTime)
            {
                mergedIntervals[^1] = previousInterval with { EndTime = interval.EndTime };
            }
        }

        return mergedIntervals;
    }

    private static List<TimeRange> SubtractReservedSlots(
        List<TimeRange> availabilityIntervals,
        List<ReservedTimeRange> reservedSlots)
    {
        var bookableSlots = new List<TimeRange>();

        foreach (var availability in availabilityIntervals)
        {
            var currentStart = availability.StartTime;
            var overlappingReservations = reservedSlots
                .Where(reservation =>
                    reservation.StartTime < availability.EndTime &&
                    reservation.EndTime > availability.StartTime)
                .OrderBy(reservation => reservation.StartTime);

            foreach (var reservation in overlappingReservations)
            {
                if (reservation.StartTime > currentStart)
                {
                    bookableSlots.Add(new TimeRange(currentStart, reservation.StartTime));
                }

                if (reservation.EndTime > currentStart)
                {
                    currentStart = reservation.EndTime;
                }
            }

            if (currentStart < availability.EndTime)
            {
                bookableSlots.Add(new TimeRange(currentStart, availability.EndTime));
            }
        }

        return bookableSlots;
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

    private sealed record TimeRange(DateTime StartTime, DateTime EndTime);

    private sealed record ReservedTimeRange(
        int Id,
        DateTime StartTime,
        DateTime EndTime);
}
