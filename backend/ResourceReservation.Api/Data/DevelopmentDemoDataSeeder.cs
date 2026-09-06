using Microsoft.EntityFrameworkCore;
using ResourceReservation.Api.Models;

namespace ResourceReservation.Api.Data;

public static class DevelopmentDemoDataSeeder
{
    public static async Task SeedAsync(AppDbContext context)
    {
        var demoResources = new[]
        {
            new Resource
            {
                Name = "Meeting Room A",
                Description = "Small meeting room for team sessions.",
                Location = "First floor",
                IsActive = true
            },
            new Resource
            {
                Name = "Projector",
                Description = "Portable projector for presentations.",
                Location = "Equipment storage",
                IsActive = true
            }
        };

        foreach (var demoResource in demoResources)
        {
            var resourceExists = await context.Resources
                .AnyAsync(resource => resource.Name == demoResource.Name);

            if (!resourceExists)
            {
                context.Resources.Add(demoResource);
            }
        }

        await context.SaveChangesAsync();

        var meetingRoom = await context.Resources
            .FirstAsync(resource => resource.Name == "Meeting Room A");
        var projector = await context.Resources
            .FirstAsync(resource => resource.Name == "Projector");

        var demoAvailabilities = new[]
        {
            new Availability
            {
                ResourceId = meetingRoom.Id,
                StartTime = new DateTime(2030, 1, 15, 9, 0, 0),
                EndTime = new DateTime(2030, 1, 15, 11, 0, 0)
            },
            new Availability
            {
                ResourceId = projector.Id,
                StartTime = new DateTime(2030, 1, 15, 13, 0, 0),
                EndTime = new DateTime(2030, 1, 15, 15, 0, 0)
            }
        };

        foreach (var demoAvailability in demoAvailabilities)
        {
            var availabilityExists = await context.Availabilities.AnyAsync(availability =>
                availability.ResourceId == demoAvailability.ResourceId &&
                availability.StartTime == demoAvailability.StartTime &&
                availability.EndTime == demoAvailability.EndTime);

            if (!availabilityExists)
            {
                context.Availabilities.Add(demoAvailability);
            }
        }

        await context.SaveChangesAsync();
    }
}
