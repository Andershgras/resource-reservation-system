using Microsoft.AspNetCore.Mvc;
using ResourceReservation.Api.Models;
using Microsoft.EntityFrameworkCore;
using ResourceReservation.Api.Data;

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
    public async Task<ActionResult<IEnumerable<Resource>>> GetResources()
    {
        return await _context.Resources.ToListAsync();
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<Resource>> GetResource(int id)
    {
        var resource = await _context.Resources.FindAsync(id);

        if (resource is null)
        {
            return NotFound();
        }

        return Ok(resource);
    }

    [HttpPost]
    public async Task<ActionResult<Resource>> CreateResource(Resource resource)
    {
        _context.Resources.Add(resource);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetResource), new { id = resource.Id }, resource);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateResource(int id, Resource updatedResource)
    {
        if (id != updatedResource.Id)
        {
            return BadRequest();
        }

        var resource = await _context.Resources.FindAsync(id);

        if (resource is null)
        {
            return NotFound();
        }

        resource.Name = updatedResource.Name;
        resource.Description = updatedResource.Description;
        resource.Location = updatedResource.Location;
        resource.IsActive = updatedResource.IsActive;

        await _context.SaveChangesAsync();

        return NoContent();
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteResource(int id)
    {
        var resource = await _context.Resources.FindAsync(id);

        if (resource is null)
        {
            return NotFound();
        }

        _context.Resources.Remove(resource);
        await _context.SaveChangesAsync();

        return NoContent();
    }
}
