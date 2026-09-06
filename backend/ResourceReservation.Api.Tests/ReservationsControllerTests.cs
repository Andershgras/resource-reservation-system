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
        AssertApiError(
            badRequest,
            "Resource is already reserved in this time period.");
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
        AssertApiError(
            badRequest,
            "Resource is not available in this time period.");
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
        AssertApiError(badRequest, "Resource is not active.");
    }

    [Fact]
    public async Task GetReservation_WhenReservationDoesNotExist_ReturnsNotFoundError()
    {
        await using var context = CreateContext();
        var user = await SeedUserAsync(context);
        var controller = CreateController(context, user.Id);

        var result = await controller.GetReservation(999);

        var notFound = Assert.IsType<NotFoundObjectResult>(result.Result);
        AssertApiError(notFound, "Reservation not found.");
    }

    [Fact]
    public async Task CreateReservation_WhenCurrentUserIsMissing_ReturnsUnauthorizedError()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceWithAvailabilityAsync(context);
        var controller = CreateController(context, null);

        var result = await controller.CreateReservation(new CreateReservationDto
        {
            ResourceId = resource.Id,
            StartTime = new DateTime(2030, 1, 15, 10, 0, 0),
            EndTime = new DateTime(2030, 1, 15, 11, 0, 0)
        });

        var unauthorized = Assert.IsType<UnauthorizedObjectResult>(result.Result);
        AssertApiError(unauthorized, "Authentication is required.");
    }

    [Fact]
    public async Task CancelReservation_WhenReservationBelongsToAnotherUser_ReturnsForbiddenError()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceWithAvailabilityAsync(context);
        var reservationOwner = await SeedUserAsync(context);
        var currentUser = await SeedUserAsync(context);
        await SeedReservationAsync(
            context,
            resource.Id,
            reservationOwner.Id,
            new DateTime(2030, 1, 15, 10, 0, 0),
            new DateTime(2030, 1, 15, 11, 0, 0),
            ReservationStatuses.Active);
        var controller = CreateController(context, currentUser.Id);

        var result = await controller.CancelReservation(1);

        var forbidden = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, forbidden.StatusCode);
        AssertApiError(
            forbidden,
            "You do not have permission to access this resource.");
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
        int? userId)
    {
        var claims = userId is null
            ? Array.Empty<Claim>()
            : [new Claim(ClaimTypes.NameIdentifier, userId.ToString()!)];
        var user = new ClaimsPrincipal(new ClaimsIdentity(
            claims,
            "TestAuth"));

        return new ReservationsController(context)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext { User = user }
            }
        };
    }

    private static void AssertApiError(ObjectResult objectResult, string expectedMessage)
    {
        var error = Assert.IsType<ApiErrorResponseDto>(objectResult.Value);
        Assert.Equal(expectedMessage, error.Message);
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
