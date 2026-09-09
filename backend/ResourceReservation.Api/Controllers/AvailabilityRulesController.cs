using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ResourceReservation.Api.Data;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.Models;

namespace ResourceReservation.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AvailabilityRulesController : ControllerBase
{
    private readonly AppDbContext _context;

    public AvailabilityRulesController(AppDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<AvailabilityRuleResponseDto>>> GetAvailabilityRules()
    {
        return await _context.AvailabilityRules
            .Include(rule => rule.Resource)
            .OrderBy(rule => rule.Resource!.Name)
            .ThenBy(rule => rule.DayOfWeek)
            .ThenBy(rule => rule.StartTime)
            .Select(rule => ToAvailabilityRuleResponseDto(rule))
            .ToListAsync();
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<AvailabilityRuleResponseDto>> GetAvailabilityRule(int id)
    {
        var rule = await _context.AvailabilityRules
            .Include(rule => rule.Resource)
            .FirstOrDefaultAsync(rule => rule.Id == id);

        if (rule is null)
        {
            return NotFound(ApiError("Availability rule not found."));
        }

        return Ok(ToAvailabilityRuleResponseDto(rule));
    }

    [HttpPost]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<AvailabilityRuleResponseDto>> CreateAvailabilityRule(
        CreateAvailabilityRuleDto createAvailabilityRuleDto)
    {
        var resource = await _context.Resources
            .FirstOrDefaultAsync(resource => resource.Id == createAvailabilityRuleDto.ResourceId);

        if (resource is null)
        {
            return BadRequest(ApiError("Resource does not exist."));
        }

        if (createAvailabilityRuleDto.EndTime <= createAvailabilityRuleDto.StartTime)
        {
            return BadRequest(ApiError("EndTime must be after StartTime."));
        }

        var dayOfWeek = (DayOfWeek)createAvailabilityRuleDto.DayOfWeek;

        if (await HasOverlappingAvailabilityRule(
            createAvailabilityRuleDto.ResourceId,
            dayOfWeek,
            createAvailabilityRuleDto.StartTime,
            createAvailabilityRuleDto.EndTime))
        {
            return BadRequest(ApiError(
                "Availability rule overlaps an existing rule for this resource."));
        }

        var rule = new AvailabilityRule
        {
            ResourceId = createAvailabilityRuleDto.ResourceId,
            DayOfWeek = dayOfWeek,
            StartTime = createAvailabilityRuleDto.StartTime,
            EndTime = createAvailabilityRuleDto.EndTime,
            Resource = resource
        };

        _context.AvailabilityRules.Add(rule);
        await _context.SaveChangesAsync();

        return CreatedAtAction(
            nameof(GetAvailabilityRule),
            new { id = rule.Id },
            ToAvailabilityRuleResponseDto(rule));
    }

    [HttpPut("{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> UpdateAvailabilityRule(
        int id,
        UpdateAvailabilityRuleDto updateAvailabilityRuleDto)
    {
        var rule = await _context.AvailabilityRules.FindAsync(id);

        if (rule is null)
        {
            return NotFound(ApiError("Availability rule not found."));
        }

        var resourceExists = await _context.Resources
            .AnyAsync(resource => resource.Id == updateAvailabilityRuleDto.ResourceId);

        if (!resourceExists)
        {
            return BadRequest(ApiError("Resource does not exist."));
        }

        if (updateAvailabilityRuleDto.EndTime <= updateAvailabilityRuleDto.StartTime)
        {
            return BadRequest(ApiError("EndTime must be after StartTime."));
        }

        var dayOfWeek = (DayOfWeek)updateAvailabilityRuleDto.DayOfWeek;

        if (await HasOverlappingAvailabilityRule(
            updateAvailabilityRuleDto.ResourceId,
            dayOfWeek,
            updateAvailabilityRuleDto.StartTime,
            updateAvailabilityRuleDto.EndTime,
            id))
        {
            return BadRequest(ApiError(
                "Availability rule overlaps an existing rule for this resource."));
        }

        rule.ResourceId = updateAvailabilityRuleDto.ResourceId;
        rule.DayOfWeek = dayOfWeek;
        rule.StartTime = updateAvailabilityRuleDto.StartTime;
        rule.EndTime = updateAvailabilityRuleDto.EndTime;

        await _context.SaveChangesAsync();

        return NoContent();
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> DeleteAvailabilityRule(int id)
    {
        var rule = await _context.AvailabilityRules.FindAsync(id);

        if (rule is null)
        {
            return NotFound(ApiError("Availability rule not found."));
        }

        _context.AvailabilityRules.Remove(rule);
        await _context.SaveChangesAsync();

        return NoContent();
    }

    private static AvailabilityRuleResponseDto ToAvailabilityRuleResponseDto(
        AvailabilityRule rule)
    {
        return new AvailabilityRuleResponseDto
        {
            Id = rule.Id,
            ResourceId = rule.ResourceId,
            ResourceName = rule.Resource?.Name ?? string.Empty,
            DayOfWeek = (int)rule.DayOfWeek,
            DayName = rule.DayOfWeek.ToString(),
            StartTime = rule.StartTime,
            EndTime = rule.EndTime
        };
    }

    private Task<bool> HasOverlappingAvailabilityRule(
        int resourceId,
        DayOfWeek dayOfWeek,
        TimeOnly startTime,
        TimeOnly endTime,
        int? ignoredRuleId = null)
    {
        return _context.AvailabilityRules
            .AnyAsync(rule =>
                rule.ResourceId == resourceId &&
                rule.DayOfWeek == dayOfWeek &&
                rule.Id != ignoredRuleId &&
                startTime < rule.EndTime &&
                endTime > rule.StartTime);
    }

    private static ApiErrorResponseDto ApiError(string message)
    {
        return new ApiErrorResponseDto { Message = message };
    }
}
