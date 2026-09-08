using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ResourceReservation.Api.Controllers;
using ResourceReservation.Api.Data;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.Models;

namespace ResourceReservation.Api.Tests;

public class AvailabilitiesControllerTests
{
    [Fact]
    public async Task CreateAvailability_WhenResourceDoesNotExist_ReturnsBadRequest()
    {
        await using var context = CreateContext();
        var controller = new AvailabilitiesController(context);

        var result = await controller.CreateAvailability(new CreateAvailabilityDto
        {
            ResourceId = 999,
            StartTime = new DateTime(2030, 1, 15, 9, 0, 0),
            EndTime = new DateTime(2030, 1, 15, 10, 0, 0)
        });

        var badRequest = Assert.IsType<BadRequestObjectResult>(result.Result);
        AssertApiError(badRequest, "Resource does not exist.");
    }

    [Theory]
    [InlineData(10, 0, 10, 0)]
    [InlineData(11, 0, 10, 0)]
    public async Task CreateAvailability_WhenEndTimeIsNotAfterStartTime_ReturnsBadRequest(
        int startHour,
        int startMinute,
        int endHour,
        int endMinute)
    {
        await using var context = CreateContext();
        var resource = await SeedResourceAsync(context);
        var controller = new AvailabilitiesController(context);

        var result = await controller.CreateAvailability(new CreateAvailabilityDto
        {
            ResourceId = resource.Id,
            StartTime = new DateTime(2030, 1, 15, startHour, startMinute, 0),
            EndTime = new DateTime(2030, 1, 15, endHour, endMinute, 0)
        });

        var badRequest = Assert.IsType<BadRequestObjectResult>(result.Result);
        AssertApiError(badRequest, "EndTime must be after StartTime.");
    }

    [Fact]
    public async Task CreateAvailability_WhenRequestIsValid_CreatesAvailability()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceAsync(context);
        var controller = new AvailabilitiesController(context);

        var result = await controller.CreateAvailability(new CreateAvailabilityDto
        {
            ResourceId = resource.Id,
            StartTime = new DateTime(2030, 1, 15, 9, 0, 0),
            EndTime = new DateTime(2030, 1, 15, 10, 0, 0)
        });

        var created = Assert.IsType<CreatedAtActionResult>(result.Result);
        var response = Assert.IsType<AvailabilityResponseDto>(created.Value);
        Assert.Equal(resource.Id, response.ResourceId);
        Assert.Equal("Test Resource", response.ResourceName);
    }

    [Fact]
    public async Task CreateAvailability_WhenSameResourceWindowOverlaps_ReturnsBadRequest()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceAsync(context);
        await SeedAvailabilityAsync(
            context,
            resource.Id,
            new DateTime(2030, 1, 15, 9, 0, 0),
            new DateTime(2030, 1, 15, 11, 0, 0));
        var controller = new AvailabilitiesController(context);

        var result = await controller.CreateAvailability(new CreateAvailabilityDto
        {
            ResourceId = resource.Id,
            StartTime = new DateTime(2030, 1, 15, 10, 0, 0),
            EndTime = new DateTime(2030, 1, 15, 12, 0, 0)
        });

        var badRequest = Assert.IsType<BadRequestObjectResult>(result.Result);
        AssertApiError(
            badRequest,
            "Availability overlaps an existing window for this resource.");
        Assert.Single(context.Availabilities);
    }

    [Fact]
    public async Task CreateAvailability_WhenSameResourceWindowIsAdjacent_CreatesAvailability()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceAsync(context);
        await SeedAvailabilityAsync(
            context,
            resource.Id,
            new DateTime(2030, 1, 15, 9, 0, 0),
            new DateTime(2030, 1, 15, 10, 0, 0));
        var controller = new AvailabilitiesController(context);

        var result = await controller.CreateAvailability(new CreateAvailabilityDto
        {
            ResourceId = resource.Id,
            StartTime = new DateTime(2030, 1, 15, 10, 0, 0),
            EndTime = new DateTime(2030, 1, 15, 11, 0, 0)
        });

        Assert.IsType<CreatedAtActionResult>(result.Result);
        Assert.Equal(2, await context.Availabilities.CountAsync());
    }

    [Fact]
    public async Task CreateAvailability_WhenDifferentResourceWindowOverlaps_CreatesAvailability()
    {
        await using var context = CreateContext();
        var firstResource = await SeedResourceAsync(context);
        var secondResource = await SeedResourceAsync(context, "Second Resource");
        await SeedAvailabilityAsync(
            context,
            firstResource.Id,
            new DateTime(2030, 1, 15, 9, 0, 0),
            new DateTime(2030, 1, 15, 11, 0, 0));
        var controller = new AvailabilitiesController(context);

        var result = await controller.CreateAvailability(new CreateAvailabilityDto
        {
            ResourceId = secondResource.Id,
            StartTime = new DateTime(2030, 1, 15, 10, 0, 0),
            EndTime = new DateTime(2030, 1, 15, 12, 0, 0)
        });

        Assert.IsType<CreatedAtActionResult>(result.Result);
        Assert.Equal(2, await context.Availabilities.CountAsync());
    }

    [Fact]
    public async Task UpdateAvailability_WhenSameResourceWindowOverlaps_ReturnsBadRequest()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceAsync(context);
        await SeedAvailabilityAsync(
            context,
            resource.Id,
            new DateTime(2030, 1, 15, 9, 0, 0),
            new DateTime(2030, 1, 15, 11, 0, 0));
        var availabilityToUpdate = await SeedAvailabilityAsync(
            context,
            resource.Id,
            new DateTime(2030, 1, 15, 12, 0, 0),
            new DateTime(2030, 1, 15, 13, 0, 0));
        var controller = new AvailabilitiesController(context);

        var result = await controller.UpdateAvailability(
            availabilityToUpdate.Id,
            new UpdateAvailabilityDto
            {
                ResourceId = resource.Id,
                StartTime = new DateTime(2030, 1, 15, 10, 0, 0),
                EndTime = new DateTime(2030, 1, 15, 12, 0, 0)
            });

        var badRequest = Assert.IsType<BadRequestObjectResult>(result);
        AssertApiError(
            badRequest,
            "Availability overlaps an existing window for this resource.");
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

    private static async Task<Availability> SeedAvailabilityAsync(
        AppDbContext context,
        int resourceId,
        DateTime startTime,
        DateTime endTime)
    {
        var availability = new Availability
        {
            ResourceId = resourceId,
            StartTime = startTime,
            EndTime = endTime
        };

        context.Availabilities.Add(availability);
        await context.SaveChangesAsync();

        return availability;
    }

    private static void AssertApiError(ObjectResult objectResult, string expectedMessage)
    {
        var error = Assert.IsType<ApiErrorResponseDto>(objectResult.Value);
        Assert.Equal(expectedMessage, error.Message);
    }
}
