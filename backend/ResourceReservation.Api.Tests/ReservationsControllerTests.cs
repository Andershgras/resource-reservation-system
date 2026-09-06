using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ResourceReservation.Api.Controllers;
using ResourceReservation.Api.Data;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.Models;

namespace ResourceReservation.Api.Tests;

public class ReservationsControllerTests
{
    [Fact]
    public async Task CreateReservation_WhenActiveReservationOverlapsSameResource_ReturnsBadRequest()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceWithAvailabilityAsync(context);
        var user = await SeedUserAsync(context);
        await SeedReservationAsync(
            context,
            resource.Id,
            user.Id,
            new DateTime(2030, 1, 15, 10, 0, 0),
            new DateTime(2030, 1, 15, 11, 0, 0),
            ReservationStatuses.Active);
        var controller = CreateController(context, user.Id);

        var result = await controller.CreateReservation(new CreateReservationDto
        {
            ResourceId = resource.Id,
            StartTime = new DateTime(2030, 1, 15, 10, 30, 0),
            EndTime = new DateTime(2030, 1, 15, 11, 30, 0)
        });

        var badRequest = Assert.IsType<BadRequestObjectResult>(result.Result);
        Assert.Equal("Resource is already reserved in this time period.", badRequest.Value);
    }

    [Fact]
    public async Task CreateReservation_WhenCancelledReservationOverlapsSameResource_CreatesReservation()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceWithAvailabilityAsync(context);
        var user = await SeedUserAsync(context);
        await SeedReservationAsync(
            context,
            resource.Id,
            user.Id,
            new DateTime(2030, 1, 15, 10, 0, 0),
            new DateTime(2030, 1, 15, 11, 0, 0),
            ReservationStatuses.Cancelled);
        var controller = CreateController(context, user.Id);

        var result = await controller.CreateReservation(new CreateReservationDto
        {
            ResourceId = resource.Id,
            StartTime = new DateTime(2030, 1, 15, 10, 30, 0),
            EndTime = new DateTime(2030, 1, 15, 11, 30, 0)
        });

        var created = Assert.IsType<CreatedAtActionResult>(result.Result);
        var response = Assert.IsType<ReservationResponseDto>(created.Value);
        Assert.Equal(ReservationStatuses.Active, response.Status);
    }

    [Fact]
    public async Task CreateReservation_WhenOutsideAvailabilityWindow_ReturnsBadRequest()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceWithAvailabilityAsync(context);
        var user = await SeedUserAsync(context);
        var controller = CreateController(context, user.Id);

        var result = await controller.CreateReservation(new CreateReservationDto
        {
            ResourceId = resource.Id,
            StartTime = new DateTime(2030, 1, 15, 8, 30, 0),
            EndTime = new DateTime(2030, 1, 15, 9, 30, 0)
        });

        var badRequest = Assert.IsType<BadRequestObjectResult>(result.Result);
        Assert.Equal("Resource is not available in this time period.", badRequest.Value);
    }

    [Fact]
    public async Task CreateReservation_WhenResourceIsInactive_ReturnsBadRequest()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceWithAvailabilityAsync(context, isActive: false);
        var user = await SeedUserAsync(context);
        var controller = CreateController(context, user.Id);

        var result = await controller.CreateReservation(new CreateReservationDto
        {
            ResourceId = resource.Id,
            StartTime = new DateTime(2030, 1, 15, 10, 0, 0),
            EndTime = new DateTime(2030, 1, 15, 11, 0, 0)
        });

        var badRequest = Assert.IsType<BadRequestObjectResult>(result.Result);
        Assert.Equal("Resource is not active.", badRequest.Value);
    }

    private static AppDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        return new AppDbContext(options);
    }

    private static ReservationsController CreateController(
        AppDbContext context,
        int userId)
    {
        var user = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, userId.ToString())],
            "TestAuth"));

        return new ReservationsController(context)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext { User = user }
            }
        };
    }

    private static async Task<Resource> SeedResourceWithAvailabilityAsync(
        AppDbContext context,
        bool isActive = true)
    {
        var resource = new Resource
        {
            Name = "Test Resource",
            IsActive = isActive
        };

        context.Resources.Add(resource);
        await context.SaveChangesAsync();

        context.Availabilities.Add(new Availability
        {
            ResourceId = resource.Id,
            StartTime = new DateTime(2030, 1, 15, 9, 0, 0),
            EndTime = new DateTime(2030, 1, 15, 12, 0, 0)
        });
        await context.SaveChangesAsync();

        return resource;
    }

    private static async Task<User> SeedUserAsync(AppDbContext context)
    {
        var user = new User
        {
            Name = "Test User",
            Email = $"{Guid.NewGuid()}@example.com",
            PasswordHash = "test-password-hash"
        };

        context.Users.Add(user);
        await context.SaveChangesAsync();

        return user;
    }

    private static async Task SeedReservationAsync(
        AppDbContext context,
        int resourceId,
        int userId,
        DateTime startTime,
        DateTime endTime,
        string status)
    {
        context.Reservations.Add(new Reservation
        {
            ResourceId = resourceId,
            UserId = userId,
            StartTime = startTime,
            EndTime = endTime,
            Status = status
        });

        await context.SaveChangesAsync();
    }
}
