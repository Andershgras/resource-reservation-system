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

        // Weekday opening hours, so there is always something to book inside
        // the booking horizon. A resource that already has weekly rules keeps them.
        await SeedWeekdayRulesAsync(context, meetingRoom.Id, new TimeOnly(8, 0), new TimeOnly(16, 0));
        await SeedWeekdayRulesAsync(context, projector.Id, new TimeOnly(9, 0), new TimeOnly(15, 0));
        await context.SaveChangesAsync();
    }

    private static async Task SeedWeekdayRulesAsync(
        AppDbContext context,
        int resourceId,
        TimeOnly startTime,
        TimeOnly endTime)
    {
        if (await context.AvailabilityRules.AnyAsync(rule => rule.ResourceId == resourceId))
        {
            return;
        }

        foreach (var dayOfWeek in new[]
                 {
                     DayOfWeek.Monday,
                     DayOfWeek.Tuesday,
                     DayOfWeek.Wednesday,
                     DayOfWeek.Thursday,
                     DayOfWeek.Friday
                 })
        {
            context.AvailabilityRules.Add(new AvailabilityRule
            {
                ResourceId = resourceId,
                DayOfWeek = dayOfWeek,
                StartTime = startTime,
                EndTime = endTime
            });
        }
    }
}
