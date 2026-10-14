using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using ResourceReservation.Api.Configuration;
using ResourceReservation.Api.Controllers;
using ResourceReservation.Api.Data;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.Models;
using ResourceReservation.Api.Services;

namespace ResourceReservation.Api.Tests;

public class ResourcesControllerTests
{
    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task CreateResource_WhenNameIsMissing_ReturnsBadRequest(string name)
    {
        await using var context = CreateContext();
        var controller = CreateController(context);

        var result = await controller.CreateResource(new CreateResourceDto
        {
            Name = name
        });

        ProblemAssert.IsProblem(result.Result, StatusCodes.Status400BadRequest, "Name is required.");
    }

    [Fact]
    public async Task CreateResource_WhenNameHasOuterWhitespace_TrimsNameBeforeSaving()
    {
        await using var context = CreateContext();
        var controller = CreateController(context);

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
        var controller = CreateController(context);

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
        var controller = CreateController(context);

        var result = await controller.DeleteResource(resource.Id);

        ProblemAssert.IsProblem(result, StatusCodes.Status400BadRequest, "Resource has reservation history and cannot be deleted. Mark it inactive instead.");
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
        var controller = CreateController(context);

        var result = await controller.DeleteResource(resource.Id);

        ProblemAssert.IsProblem(result, StatusCodes.Status400BadRequest, "Resource has reservation history and cannot be deleted. Mark it inactive instead.");

        var savedResource = await context.Resources.FindAsync(resource.Id);
        var savedReservation = await context.Reservations.FindAsync(reservation.Id);

        Assert.NotNull(savedResource);
        Assert.False(savedResource.IsActive);
        Assert.NotNull(savedReservation);
    }

    private static ResourcesController CreateController(AppDbContext context)
    {
        var clock = TestSchedulingClock.Create();
        var bookingPolicy = TestBookingPolicy.Create();
        var availabilityService = new AvailabilityService(context, clock, bookingPolicy);

        return new ResourcesController(
            context,
            availabilityService,
            new ReservationService(
                context,
                availabilityService,
                clock,
                new ApplicationLocks(context, Options.Create(new SchedulingOptions { TimeZoneId = "Europe/Copenhagen" })),
                bookingPolicy),
            bookingPolicy)
            .WithHttpContext();
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
        string status = ReservationStatuses.Active,
        DateTime? startTime = null,
        DateTime? endTime = null)
    {
        var reservationStartTime = startTime ?? DateTime.UtcNow.AddDays(-2);
        var reservation = new Reservation
        {
            ResourceId = resourceId,
            UserId = 1,
            StartTime = reservationStartTime,
            EndTime = endTime ?? reservationStartTime.AddHours(1),
            Status = status
        };

        context.Reservations.Add(reservation);
        await context.SaveChangesAsync();

        return reservation;
    }
}
