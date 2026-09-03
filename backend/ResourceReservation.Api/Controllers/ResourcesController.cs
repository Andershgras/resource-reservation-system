using Microsoft.AspNetCore.Mvc;
using ResourceReservation.Api.Models;

namespace ResourceReservation.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ResourcesController : ControllerBase
{
    // In-memory list of resources for demonstration purposes.
    private static readonly List<Resource> Resources =
    [
        new Resource
        {
            Id = 1,
            Name = "Meeting Room A",
            Description = "A generic meeting room resource.",
            Location = "First floor",
            IsActive = true
        },
        new Resource
        {
            Id = 2,
            Name = "Projector",
            Description = "Portable presentation equipment.",
            Location = "Storage Room",
            IsActive = true
        }
    ];

    [HttpGet]
    public ActionResult<IEnumerable<Resource>> GetResources()
    {
        return Ok(Resources);
    }

    [HttpGet("{id}")]
    public ActionResult<Resource> GetResource(int id)
    {
        var resource = Resources.FirstOrDefault(resource => resource.Id == id);

        if (resource == null)
        {
            return NotFound();
        }

        return Ok(resource);
    }

    [HttpPost]
    public ActionResult<Resource> CreateResource(Resource resource)
    {
        var nextId = Resources.Count == 0
            ? 1
            : Resources.Max(resource => resource.Id) + 1;

        resource.Id = nextId;
        Resources.Add(resource);

        return CreatedAtAction(nameof(GetResource), new { id = resource.Id }, resource);
    }

    [HttpPut("{id}")]
    public IActionResult UpdateResource(int id, Resource updatedResource)
    {
        var resource = Resources.FirstOrDefault(resource => resource.Id == id);

        if (resource == null)
        {
            return NotFound();
        }

        resource.Name = updatedResource.Name;
        resource.Description = updatedResource.Description;
        resource.Location = updatedResource.Location;
        resource.IsActive = updatedResource.IsActive;

        return NoContent();
    }

    [HttpDelete("{id}")]
    public IActionResult DeleteResource(int id)
    {
        var resource = Resources.FirstOrDefault(resource => resource.Id == id);

        if (resource == null)
        {
            return NotFound();
        }

        Resources.Remove(resource);

        return NoContent();
    }
}
