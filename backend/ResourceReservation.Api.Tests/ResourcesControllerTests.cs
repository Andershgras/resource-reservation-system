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

    [Fact]
    public async Task GetResourceSchedule_WhenResourceDoesNotExist_ReturnsNotFound()
    {
        await using var context = CreateContext();
        var controller = new ResourcesController(context);

        var result = await controller.GetResourceSchedule(
            999,
            new DateOnly(2030, 1, 16),
            new DateOnly(2030, 1, 16));

        var notFound = Assert.IsType<NotFoundObjectResult>(result.Result);
        AssertApiError(notFound, "Resource not found.");
    }

    [Fact]
    public async Task GetResourceSchedule_WhenDateRangeIsInvalid_ReturnsBadRequest()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceAsync(context);
        var controller = new ResourcesController(context);

        var result = await controller.GetResourceSchedule(
            resource.Id,
            new DateOnly(2030, 1, 17),
            new DateOnly(2030, 1, 16));

        var badRequest = Assert.IsType<BadRequestObjectResult>(result.Result);
        AssertApiError(badRequest, "To date must be on or after from date.");
    }

    [Fact]
    public async Task GetResourceSchedule_WhenRuleHasActiveReservation_ReturnsRemainingBookableSlots()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceAsync(context);
        await SeedAvailabilityRuleAsync(
            context,
            resource.Id,
            DayOfWeek.Wednesday,
            new TimeOnly(8, 0),
            new TimeOnly(16, 0));
        var reservation = await SeedReservationAsync(
            context,
            resource.Id,
            ReservationStatuses.Active,
            new DateTime(2030, 1, 16, 10, 0, 0),
            new DateTime(2030, 1, 16, 11, 0, 0));
        var controller = new ResourcesController(context);

        var result = await controller.GetResourceSchedule(
            resource.Id,
            new DateOnly(2030, 1, 16),
            new DateOnly(2030, 1, 16));

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var response = Assert.IsType<ResourceScheduleResponseDto>(ok.Value);

        Assert.Equal(resource.Id, response.ResourceId);
        Assert.Equal("Meeting Room", response.ResourceName);
        Assert.Collection(
            response.BookableSlots,
            first =>
            {
                Assert.Equal(new DateTime(2030, 1, 16, 8, 0, 0), first.StartTime);
                Assert.Equal(new DateTime(2030, 1, 16, 10, 0, 0), first.EndTime);
            },
            second =>
            {
                Assert.Equal(new DateTime(2030, 1, 16, 11, 0, 0), second.StartTime);
                Assert.Equal(new DateTime(2030, 1, 16, 16, 0, 0), second.EndTime);
            });
        var reservedSlot = Assert.Single(response.ReservedSlots);
        Assert.Equal(reservation.Id, reservedSlot.ReservationId);
        Assert.Equal(new DateTime(2030, 1, 16, 10, 0, 0), reservedSlot.StartTime);
        Assert.Equal(new DateTime(2030, 1, 16, 11, 0, 0), reservedSlot.EndTime);
    }

    [Fact]
    public async Task GetResourceSchedule_WhenCancelledReservationOverlaps_ReturnsFullRuleSlot()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceAsync(context);
        await SeedAvailabilityRuleAsync(
            context,
            resource.Id,
            DayOfWeek.Wednesday,
            new TimeOnly(8, 0),
            new TimeOnly(16, 0));
        await SeedReservationAsync(
            context,
            resource.Id,
            ReservationStatuses.Cancelled,
            new DateTime(2030, 1, 16, 10, 0, 0),
            new DateTime(2030, 1, 16, 11, 0, 0));
        var controller = new ResourcesController(context);

        var result = await controller.GetResourceSchedule(
            resource.Id,
            new DateOnly(2030, 1, 16),
            new DateOnly(2030, 1, 16));

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var response = Assert.IsType<ResourceScheduleResponseDto>(ok.Value);
        var bookableSlot = Assert.Single(response.BookableSlots);

        Assert.Equal(new DateTime(2030, 1, 16, 8, 0, 0), bookableSlot.StartTime);
        Assert.Equal(new DateTime(2030, 1, 16, 16, 0, 0), bookableSlot.EndTime);
        Assert.Empty(response.ReservedSlots);
    }

    [Fact]
    public async Task GetResourceSchedule_WhenOneOffAvailabilityExists_ReturnsBookableSlot()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceAsync(context);
        await SeedAvailabilityAsync(
            context,
            resource.Id,
            new DateTime(2030, 1, 17, 14, 0, 0),
            new DateTime(2030, 1, 17, 15, 0, 0));
        var controller = new ResourcesController(context);

        var result = await controller.GetResourceSchedule(
            resource.Id,
            new DateOnly(2030, 1, 17),
            new DateOnly(2030, 1, 17));

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var response = Assert.IsType<ResourceScheduleResponseDto>(ok.Value);
        var bookableSlot = Assert.Single(response.BookableSlots);

        Assert.Equal(new DateTime(2030, 1, 17, 14, 0, 0), bookableSlot.StartTime);
        Assert.Equal(new DateTime(2030, 1, 17, 15, 0, 0), bookableSlot.EndTime);
    }

    [Fact]
    public async Task GetResourceSchedule_WhenNoRuleMatchesDate_ReturnsNoBookableSlots()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceAsync(context);
        await SeedAvailabilityRuleAsync(
            context,
            resource.Id,
            DayOfWeek.Wednesday,
            new TimeOnly(8, 0),
            new TimeOnly(16, 0));
        var controller = new ResourcesController(context);

        var result = await controller.GetResourceSchedule(
            resource.Id,
            new DateOnly(2030, 1, 17),
            new DateOnly(2030, 1, 17));

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var response = Assert.IsType<ResourceScheduleResponseDto>(ok.Value);

        Assert.Empty(response.BookableSlots);
        Assert.Empty(response.ReservedSlots);
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

    private static void AssertApiError(ObjectResult objectResult, string expectedMessage)
    {
        var error = Assert.IsType<ApiErrorResponseDto>(objectResult.Value);
        Assert.Equal(expectedMessage, error.Message);
    }
}
