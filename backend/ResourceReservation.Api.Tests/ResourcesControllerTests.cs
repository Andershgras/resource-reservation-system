using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ResourceReservation.Api.Controllers;
using ResourceReservation.Api.Data;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.Models;

namespace ResourceReservation.Api.Tests;

public class ResourcesControllerTests
{
    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task CreateResource_WhenNameIsMissing_ReturnsBadRequest(string name)
    {
        await using var context = CreateContext();
        var controller = new ResourcesController(context);

        var result = await controller.CreateResource(new CreateResourceDto
        {
            Name = name
        });

        var badRequest = Assert.IsType<BadRequestObjectResult>(result.Result);
        AssertApiError(badRequest, "Name is required.");
    }

    [Fact]
    public async Task CreateResource_WhenNameHasOuterWhitespace_TrimsNameBeforeSaving()
    {
        await using var context = CreateContext();
        var controller = new ResourcesController(context);

        var result = await controller.CreateResource(new CreateResourceDto
        {
            Name = "  Meeting Room  ",
            Description = "  Shared workspace  ",
            Location = "  Floor 2  "
        });

        var created = Assert.IsType<CreatedAtActionResult>(result.Result);
        var response = Assert.IsType<ResourceResponseDto>(created.Value);
        Assert.Equal("Meeting Room", response.Name);

        var savedResource = await context.Resources.FindAsync(response.Id);
        Assert.NotNull(savedResource);
        Assert.Equal("Meeting Room", savedResource.Name);
    }

    [Fact]
    public async Task DeleteResource_WhenResourceHasNoReservations_DeletesResource()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceAsync(context);
        var controller = new ResourcesController(context);

        var result = await controller.DeleteResource(resource.Id);

        Assert.IsType<NoContentResult>(result);
        Assert.Empty(context.Resources);
    }

    [Fact]
    public async Task DeleteResource_WhenResourceHasReservationHistory_ReturnsBadRequest()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceAsync(context);
        var reservation = await SeedReservationAsync(context, resource.Id);
        var controller = new ResourcesController(context);

        var result = await controller.DeleteResource(resource.Id);

        var badRequest = Assert.IsType<BadRequestObjectResult>(result);
        AssertApiError(
            badRequest,
            "Resource has reservation history and cannot be deleted. Mark it inactive instead.");
        Assert.NotNull(await context.Resources.FindAsync(resource.Id));
        Assert.NotNull(await context.Reservations.FindAsync(reservation.Id));
    }

    [Fact]
    public async Task DeleteResource_WhenInactiveResourceHasReservationHistory_ReturnsBadRequest()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceAsync(context, isActive: false);
        var reservation = await SeedReservationAsync(
            context,
            resource.Id,
            ReservationStatuses.Cancelled);
        var controller = new ResourcesController(context);

        var result = await controller.DeleteResource(resource.Id);

        var badRequest = Assert.IsType<BadRequestObjectResult>(result);
        AssertApiError(
            badRequest,
            "Resource has reservation history and cannot be deleted. Mark it inactive instead.");

        var savedResource = await context.Resources.FindAsync(resource.Id);
        var savedReservation = await context.Reservations.FindAsync(reservation.Id);

        Assert.NotNull(savedResource);
        Assert.False(savedResource.IsActive);
        Assert.NotNull(savedReservation);
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
        bool isActive = true)
    {
        var resource = new Resource
        {
            Name = "Meeting Room",
            IsActive = isActive
        };

        context.Resources.Add(resource);
        await context.SaveChangesAsync();

        return resource;
    }

    private static async Task<Reservation> SeedReservationAsync(
        AppDbContext context,
        int resourceId,
        string status = ReservationStatuses.Active)
    {
        var reservation = new Reservation
        {
            ResourceId = resourceId,
            UserId = 1,
            StartTime = DateTime.UtcNow.AddDays(-2),
            EndTime = DateTime.UtcNow.AddDays(-2).AddHours(1),
            Status = status
        };

        context.Reservations.Add(reservation);
        await context.SaveChangesAsync();

        return reservation;
    }

    private static void AssertApiError(ObjectResult objectResult, string expectedMessage)
    {
        var error = Assert.IsType<ApiErrorResponseDto>(objectResult.Value);
        Assert.Equal(expectedMessage, error.Message);
    }
}
