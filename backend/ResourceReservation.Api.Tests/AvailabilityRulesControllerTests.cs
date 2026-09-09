using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ResourceReservation.Api.Controllers;
using ResourceReservation.Api.Data;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.Models;

namespace ResourceReservation.Api.Tests;

public class AvailabilityRulesControllerTests
{
    [Fact]
    public async Task CreateAvailabilityRule_WhenResourceDoesNotExist_ReturnsBadRequest()
    {
        await using var context = CreateContext();
        var controller = new AvailabilityRulesController(context);

        var result = await controller.CreateAvailabilityRule(new CreateAvailabilityRuleDto
        {
            ResourceId = 999,
            DayOfWeek = (int)DayOfWeek.Monday,
            StartTime = new TimeOnly(8, 0),
            EndTime = new TimeOnly(16, 0)
        });

        var badRequest = Assert.IsType<BadRequestObjectResult>(result.Result);
        AssertApiError(badRequest, "Resource does not exist.");
    }

    [Theory]
    [InlineData(10, 0, 10, 0)]
    [InlineData(11, 0, 10, 0)]
    public async Task CreateAvailabilityRule_WhenEndTimeIsNotAfterStartTime_ReturnsBadRequest(
        int startHour,
        int startMinute,
        int endHour,
        int endMinute)
    {
        await using var context = CreateContext();
        var resource = await SeedResourceAsync(context);
        var controller = new AvailabilityRulesController(context);

        var result = await controller.CreateAvailabilityRule(new CreateAvailabilityRuleDto
        {
            ResourceId = resource.Id,
            DayOfWeek = (int)DayOfWeek.Monday,
            StartTime = new TimeOnly(startHour, startMinute),
            EndTime = new TimeOnly(endHour, endMinute)
        });

        var badRequest = Assert.IsType<BadRequestObjectResult>(result.Result);
        AssertApiError(badRequest, "EndTime must be after StartTime.");
    }

    [Fact]
    public async Task CreateAvailabilityRule_WhenRequestIsValid_CreatesRule()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceAsync(context);
        var controller = new AvailabilityRulesController(context);

        var result = await controller.CreateAvailabilityRule(new CreateAvailabilityRuleDto
        {
            ResourceId = resource.Id,
            DayOfWeek = (int)DayOfWeek.Monday,
            StartTime = new TimeOnly(8, 0),
            EndTime = new TimeOnly(16, 0)
        });

        var created = Assert.IsType<CreatedAtActionResult>(result.Result);
        var response = Assert.IsType<AvailabilityRuleResponseDto>(created.Value);
        Assert.Equal(resource.Id, response.ResourceId);
        Assert.Equal("Test Resource", response.ResourceName);
        Assert.Equal((int)DayOfWeek.Monday, response.DayOfWeek);
        Assert.Equal("Monday", response.DayName);
    }

    [Fact]
    public async Task CreateAvailabilityRule_WhenSameResourceAndDayOverlaps_ReturnsBadRequest()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceAsync(context);
        await SeedAvailabilityRuleAsync(
            context,
            resource.Id,
            DayOfWeek.Monday,
            new TimeOnly(8, 0),
            new TimeOnly(12, 0));
        var controller = new AvailabilityRulesController(context);

        var result = await controller.CreateAvailabilityRule(new CreateAvailabilityRuleDto
        {
            ResourceId = resource.Id,
            DayOfWeek = (int)DayOfWeek.Monday,
            StartTime = new TimeOnly(11, 0),
            EndTime = new TimeOnly(16, 0)
        });

        var badRequest = Assert.IsType<BadRequestObjectResult>(result.Result);
        AssertApiError(
            badRequest,
            "Availability rule overlaps an existing rule for this resource.");
        Assert.Single(context.AvailabilityRules);
    }

    [Fact]
    public async Task CreateAvailabilityRule_WhenSameResourceAndDifferentDayOverlaps_CreatesRule()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceAsync(context);
        await SeedAvailabilityRuleAsync(
            context,
            resource.Id,
            DayOfWeek.Monday,
            new TimeOnly(8, 0),
            new TimeOnly(12, 0));
        var controller = new AvailabilityRulesController(context);

        var result = await controller.CreateAvailabilityRule(new CreateAvailabilityRuleDto
        {
            ResourceId = resource.Id,
            DayOfWeek = (int)DayOfWeek.Tuesday,
            StartTime = new TimeOnly(8, 0),
            EndTime = new TimeOnly(12, 0)
        });

        Assert.IsType<CreatedAtActionResult>(result.Result);
        Assert.Equal(2, await context.AvailabilityRules.CountAsync());
    }

    [Fact]
    public async Task UpdateAvailabilityRule_WhenSameResourceAndDayOverlaps_ReturnsBadRequest()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceAsync(context);
        await SeedAvailabilityRuleAsync(
            context,
            resource.Id,
            DayOfWeek.Monday,
            new TimeOnly(8, 0),
            new TimeOnly(12, 0));
        var ruleToUpdate = await SeedAvailabilityRuleAsync(
            context,
            resource.Id,
            DayOfWeek.Monday,
            new TimeOnly(13, 0),
            new TimeOnly(16, 0));
        var controller = new AvailabilityRulesController(context);

        var result = await controller.UpdateAvailabilityRule(
            ruleToUpdate.Id,
            new UpdateAvailabilityRuleDto
            {
                ResourceId = resource.Id,
                DayOfWeek = (int)DayOfWeek.Monday,
                StartTime = new TimeOnly(11, 0),
                EndTime = new TimeOnly(14, 0)
            });

        var badRequest = Assert.IsType<BadRequestObjectResult>(result);
        AssertApiError(
            badRequest,
            "Availability rule overlaps an existing rule for this resource.");
    }

    private static AppDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        return new AppDbContext(options);
    }

    private static async Task<Resource> SeedResourceAsync(
        AppDbContext context,
        string name = "Test Resource")
    {
        var resource = new Resource
        {
            Name = name,
            IsActive = true
        };

        context.Resources.Add(resource);
        await context.SaveChangesAsync();

        return resource;
    }

    private static async Task<AvailabilityRule> SeedAvailabilityRuleAsync(
        AppDbContext context,
        int resourceId,
        DayOfWeek dayOfWeek,
        TimeOnly startTime,
        TimeOnly endTime)
    {
        var rule = new AvailabilityRule
        {
            ResourceId = resourceId,
            DayOfWeek = dayOfWeek,
            StartTime = startTime,
            EndTime = endTime
        };

        context.AvailabilityRules.Add(rule);
        await context.SaveChangesAsync();

        return rule;
    }

    private static void AssertApiError(ObjectResult objectResult, string expectedMessage)
    {
        var error = Assert.IsType<ApiErrorResponseDto>(objectResult.Value);
        Assert.Equal(expectedMessage, error.Message);
    }
}
