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

    private static AppDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        return new AppDbContext(options);
    }

    private static async Task<Resource> SeedResourceAsync(AppDbContext context)
    {
        var resource = new Resource
        {
            Name = "Test Resource",
            IsActive = true
        };

        context.Resources.Add(resource);
        await context.SaveChangesAsync();

        return resource;
    }

    private static void AssertApiError(ObjectResult objectResult, string expectedMessage)
    {
        var error = Assert.IsType<ApiErrorResponseDto>(objectResult.Value);
        Assert.Equal(expectedMessage, error.Message);
    }
}
