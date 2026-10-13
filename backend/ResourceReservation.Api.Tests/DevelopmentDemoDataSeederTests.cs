using Microsoft.EntityFrameworkCore;
using ResourceReservation.Api.Data;
using ResourceReservation.Api.Models;

namespace ResourceReservation.Api.Tests;

public class DevelopmentDemoDataSeederTests
{
    [Fact]
    public async Task Seed_GivesTheDemoResourcesWeekdayOpeningHoursOnce()
    {
        await using var context = CreateContext();

        await DevelopmentDemoDataSeeder.SeedAsync(context);
        await DevelopmentDemoDataSeeder.SeedAsync(context);

        var meetingRoom = await context.Resources.SingleAsync(resource => resource.Name == "Meeting Room A");
        var rules = await context.AvailabilityRules
            .Where(rule => rule.ResourceId == meetingRoom.Id)
            .OrderBy(rule => rule.DayOfWeek)
            .ToListAsync();
        Assert.Equal(
            [DayOfWeek.Monday, DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday, DayOfWeek.Friday],
            rules.Select(rule => rule.DayOfWeek));
        Assert.All(rules, rule => Assert.Equal((new TimeOnly(8, 0), new TimeOnly(16, 0)), (rule.StartTime, rule.EndTime)));
        Assert.Equal(10, await context.AvailabilityRules.CountAsync());
    }

    [Fact]
    public async Task Seed_KeepsWeeklyRulesThatAlreadyExist()
    {
        await using var context = CreateContext();
        var meetingRoom = new Resource { Name = "Meeting Room A", IsActive = true };
        context.Resources.Add(meetingRoom);
        await context.SaveChangesAsync();
        context.AvailabilityRules.Add(new AvailabilityRule
        {
            ResourceId = meetingRoom.Id,
            DayOfWeek = DayOfWeek.Saturday,
            StartTime = new TimeOnly(10, 0),
            EndTime = new TimeOnly(12, 0)
        });
        await context.SaveChangesAsync();

        await DevelopmentDemoDataSeeder.SeedAsync(context);

        var rule = Assert.Single(await context.AvailabilityRules
            .Where(rule => rule.ResourceId == meetingRoom.Id)
            .ToListAsync());
        Assert.Equal(DayOfWeek.Saturday, rule.DayOfWeek);
    }

    private static AppDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        return new AppDbContext(options);
    }
}
