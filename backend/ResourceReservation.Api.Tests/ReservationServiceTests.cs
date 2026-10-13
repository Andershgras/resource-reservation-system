using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using ResourceReservation.Api.Configuration;
using ResourceReservation.Api.Data;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.Models;
using ResourceReservation.Api.Services;

namespace ResourceReservation.Api.Tests;

public class ReservationServiceTests
{
    private static readonly DateTime DefaultLocalNow = TestSchedulingClock.DefaultLocalNow;

    [Fact]
    public async Task CreateReservation_WhenActiveReservationOverlapsSameResource_ReturnsConflict()
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
        var service = CreateService(context);

        var result = await service.CreateAsync(new CreateReservationDto
        {
            ResourceId = resource.Id,
            StartTime = new DateTime(2030, 1, 15, 10, 30, 0),
            EndTime = new DateTime(2030, 1, 15, 11, 30, 0)
        }, user.Id);

        AssertError(result, ServiceErrorKind.Conflict, "Resource is already reserved in this time period.");
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
        var service = CreateService(context);

        var result = await service.CreateAsync(new CreateReservationDto
        {
            ResourceId = resource.Id,
            StartTime = new DateTime(2030, 1, 15, 10, 30, 0),
            EndTime = new DateTime(2030, 1, 15, 11, 30, 0)
        }, user.Id);

        Assert.True(result.IsSuccess);
        var response = result.Value;
        Assert.Equal(ReservationStatuses.Active, response.Status);
    }

    [Fact]
    public async Task CreateReservation_WhenOutsideAvailabilityWindow_ReturnsValidationError()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceWithAvailabilityAsync(context);
        var user = await SeedUserAsync(context);
        var service = CreateService(context);

        var result = await service.CreateAsync(new CreateReservationDto
        {
            ResourceId = resource.Id,
            StartTime = new DateTime(2030, 1, 15, 8, 30, 0),
            EndTime = new DateTime(2030, 1, 15, 9, 30, 0)
        }, user.Id);

        AssertError(result, ServiceErrorKind.Validation, "Resource is not available in this time period.");
    }

    [Fact]
    public async Task CreateReservation_WhenInsideAvailabilityRule_CreatesReservation()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceWithAvailabilityRuleAsync(context);
        var user = await SeedUserAsync(context);
        var service = CreateService(context);

        var result = await service.CreateAsync(new CreateReservationDto
        {
            ResourceId = resource.Id,
            StartTime = new DateTime(2030, 1, 16, 10, 0, 0),
            EndTime = new DateTime(2030, 1, 16, 11, 0, 0)
        }, user.Id);

        Assert.True(result.IsSuccess);
        var response = result.Value;
        Assert.Equal(ReservationStatuses.Active, response.Status);
        Assert.Equal(user.Name, response.UserName);
        Assert.Equal(user.Email, response.UserEmail);
    }

    [Fact]
    public async Task CreateReservation_WhenOutsideAvailabilityRule_ReturnsValidationError()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceWithAvailabilityRuleAsync(context);
        var user = await SeedUserAsync(context);
        var service = CreateService(context);

        var result = await service.CreateAsync(new CreateReservationDto
        {
            ResourceId = resource.Id,
            StartTime = new DateTime(2030, 1, 16, 15, 30, 0),
            EndTime = new DateTime(2030, 1, 16, 16, 30, 0)
        }, user.Id);

        AssertError(result, ServiceErrorKind.Validation, "Resource is not available in this time period.");
    }

    [Fact]
    public async Task CreateReservation_WhenAvailabilityRuleIsForDifferentDay_ReturnsValidationError()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceWithAvailabilityRuleAsync(context);
        var user = await SeedUserAsync(context);
        var service = CreateService(context);

        var result = await service.CreateAsync(new CreateReservationDto
        {
            ResourceId = resource.Id,
            StartTime = new DateTime(2030, 1, 19, 10, 0, 0),
            EndTime = new DateTime(2030, 1, 19, 11, 0, 0)
        }, user.Id);

        AssertError(result, ServiceErrorKind.Validation, "Resource is not available in this time period.");
    }

    [Fact]
    public async Task CreateReservation_WhenResourceIsInactive_ReturnsValidationError()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceWithAvailabilityAsync(context, isActive: false);
        var user = await SeedUserAsync(context);
        var service = CreateService(context);

        var result = await service.CreateAsync(new CreateReservationDto
        {
            ResourceId = resource.Id,
            StartTime = new DateTime(2030, 1, 15, 10, 0, 0),
            EndTime = new DateTime(2030, 1, 15, 11, 0, 0)
        }, user.Id);

        AssertError(result, ServiceErrorKind.Validation, "Resource is not active.");
    }

    [Fact]
    public async Task GetReservation_WhenReservationDoesNotExist_ReturnsNotFoundError()
    {
        await using var context = CreateContext();
        var user = await SeedUserAsync(context);
        var service = CreateService(context);

        var result = await service.GetAsync(999, new CurrentUser(user.Id, false));

        AssertError(result, ServiceErrorKind.NotFound, "Reservation not found.");
    }

    [Fact]
    public async Task GetReservation_WhenReservationBelongsToCurrentUser_ReturnsReservation()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceWithAvailabilityAsync(context);
        var user = await SeedUserAsync(context);
        var reservation = await SeedReservationAsync(
            context,
            resource.Id,
            user.Id,
            new DateTime(2030, 1, 15, 10, 0, 0),
            new DateTime(2030, 1, 15, 11, 0, 0),
            ReservationStatuses.Active);
        var service = CreateService(context);

        var result = await service.GetAsync(reservation.Id, new CurrentUser(user.Id, false));

        Assert.True(result.IsSuccess);
        var response = result.Value;
        Assert.Equal(reservation.Id, response.Id);
        Assert.Equal(user.Id, response.UserId);
        Assert.Equal(user.Email, response.UserEmail);
    }

    [Fact]
    public async Task GetReservation_WhenReservationBelongsToAnotherUser_ReturnsForbiddenError()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceWithAvailabilityAsync(context);
        var reservationOwner = await SeedUserAsync(context);
        var currentUser = await SeedUserAsync(context);
        var reservation = await SeedReservationAsync(
            context,
            resource.Id,
            reservationOwner.Id,
            new DateTime(2030, 1, 15, 10, 0, 0),
            new DateTime(2030, 1, 15, 11, 0, 0),
            ReservationStatuses.Active);
        var service = CreateService(context);

        var result = await service.GetAsync(reservation.Id, new CurrentUser(currentUser.Id, false));

        AssertError(result, ServiceErrorKind.Forbidden, "You do not have permission to access this resource.");
    }

    [Fact]
    public async Task GetReservation_WhenCurrentUserIsAdmin_ReturnsAnyReservation()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceWithAvailabilityAsync(context);
        var reservationOwner = await SeedUserAsync(context);
        var admin = await SeedUserAsync(context);
        var reservation = await SeedReservationAsync(
            context,
            resource.Id,
            reservationOwner.Id,
            new DateTime(2030, 1, 15, 10, 0, 0),
            new DateTime(2030, 1, 15, 11, 0, 0),
            ReservationStatuses.Active);
        var service = CreateService(context);

        var result = await service.GetAsync(reservation.Id, new CurrentUser(admin.Id, true));

        Assert.True(result.IsSuccess);
        var response = result.Value;
        Assert.Equal(reservation.Id, response.Id);
        Assert.Equal(reservationOwner.Id, response.UserId);
        Assert.Equal(reservationOwner.Name, response.UserName);
        Assert.Equal(reservationOwner.Email, response.UserEmail);
    }

    [Fact]
    public async Task GetAllReservations_IncludesEachOwnersNameAndEmail()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceWithAvailabilityAsync(context);
        var owner = await SeedUserAsync(context);
        await SeedReservationAsync(
            context,
            resource.Id,
            owner.Id,
            new DateTime(2030, 1, 15, 10, 0, 0),
            new DateTime(2030, 1, 15, 11, 0, 0),
            ReservationStatuses.Active);
        var service = CreateService(context);

        var reservations = await service.GetAllAsync();

        var reservation = Assert.Single(reservations);
        Assert.Equal(owner.Name, reservation.UserName);
        Assert.Equal(owner.Email, reservation.UserEmail);
    }

    [Fact]
    public async Task CancelReservation_WhenReservationBelongsToCurrentUser_CancelsReservation()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceWithAvailabilityAsync(context);
        var user = await SeedUserAsync(context);
        var reservation = await SeedReservationAsync(
            context,
            resource.Id,
            user.Id,
            new DateTime(2030, 1, 15, 10, 0, 0),
            new DateTime(2030, 1, 15, 11, 0, 0),
            ReservationStatuses.Active);
        var service = CreateService(context);

        var result = await service.CancelAsync(reservation.Id, new CurrentUser(user.Id, false));

        Assert.True(result.IsSuccess);
        var cancelledReservation = await context.Reservations.FindAsync(reservation.Id);
        Assert.NotNull(cancelledReservation);
        Assert.Equal(ReservationStatuses.Cancelled, cancelledReservation.Status);
    }

    [Fact]
    public async Task CancelReservation_WhenReservationBelongsToAnotherUser_ReturnsForbiddenError()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceWithAvailabilityAsync(context);
        var reservationOwner = await SeedUserAsync(context);
        var currentUser = await SeedUserAsync(context);
        var reservation = await SeedReservationAsync(
            context,
            resource.Id,
            reservationOwner.Id,
            new DateTime(2030, 1, 15, 10, 0, 0),
            new DateTime(2030, 1, 15, 11, 0, 0),
            ReservationStatuses.Active);
        var service = CreateService(context);

        var result = await service.CancelAsync(reservation.Id, new CurrentUser(currentUser.Id, false));

        AssertError(result, ServiceErrorKind.Forbidden, "You do not have permission to access this resource.");
    }

    [Fact]
    public async Task CancelReservation_WhenCurrentUserIsAdmin_CancelsAnyReservation()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceWithAvailabilityAsync(context);
        var reservationOwner = await SeedUserAsync(context);
        var admin = await SeedUserAsync(context);
        var reservation = await SeedReservationAsync(
            context,
            resource.Id,
            reservationOwner.Id,
            new DateTime(2030, 1, 15, 10, 0, 0),
            new DateTime(2030, 1, 15, 11, 0, 0),
            ReservationStatuses.Active);
        var service = CreateService(context);

        var result = await service.CancelAsync(reservation.Id, new CurrentUser(admin.Id, true));

        Assert.True(result.IsSuccess);
        var cancelledReservation = await context.Reservations.FindAsync(reservation.Id);
        Assert.NotNull(cancelledReservation);
        Assert.Equal(ReservationStatuses.Cancelled, cancelledReservation.Status);
        Assert.Equal(admin.Id, cancelledReservation.CancelledByUserId);
        Assert.Equal(ToUtc(DefaultLocalNow), cancelledReservation.CancelledAt);
    }

    [Fact]
    public async Task CreateReservation_RecordsCreationTimeInUtc()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceWithAvailabilityAsync(context);
        var user = await SeedUserAsync(context);
        var service = CreateService(context);

        var result = await service.CreateAsync(new CreateReservationDto
        {
            ResourceId = resource.Id,
            StartTime = new DateTime(2030, 1, 15, 10, 0, 0),
            EndTime = new DateTime(2030, 1, 15, 11, 0, 0)
        }, user.Id);

        Assert.True(result.IsSuccess);
        Assert.Equal(ToUtc(DefaultLocalNow), result.Value.CreatedAt);
        Assert.Equal(TimeSpan.Zero, result.Value.CreatedAt!.Value.Offset);
        Assert.Null(result.Value.UpdatedAt);
        Assert.Null(result.Value.CancelledAt);
    }

    [Fact]
    public async Task CreateReservation_WhenSpanningAdjacentAvailabilityRules_CreatesReservation()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceAsync(context);
        await SeedAvailabilityRuleAsync(context, resource.Id, DayOfWeek.Wednesday, new TimeOnly(8, 0), new TimeOnly(12, 0));
        await SeedAvailabilityRuleAsync(context, resource.Id, DayOfWeek.Wednesday, new TimeOnly(12, 0), new TimeOnly(16, 0));
        var user = await SeedUserAsync(context);
        var service = CreateService(context);

        var result = await service.CreateAsync(new CreateReservationDto
        {
            ResourceId = resource.Id,
            StartTime = new DateTime(2030, 1, 16, 11, 0, 0),
            EndTime = new DateTime(2030, 1, 16, 13, 0, 0)
        }, user.Id);

        Assert.True(result.IsSuccess);
    }

    [Fact]
    public async Task CreateReservation_WhenSpanningAdjacentWindowAndRule_CreatesReservation()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceAsync(context);
        await SeedAvailabilityRuleAsync(context, resource.Id, DayOfWeek.Wednesday, new TimeOnly(8, 0), new TimeOnly(12, 0));
        context.Availabilities.Add(new Availability
        {
            ResourceId = resource.Id,
            StartTime = new DateTime(2030, 1, 16, 12, 0, 0),
            EndTime = new DateTime(2030, 1, 16, 18, 0, 0)
        });
        await context.SaveChangesAsync();
        var user = await SeedUserAsync(context);
        var service = CreateService(context);

        var result = await service.CreateAsync(new CreateReservationDto
        {
            ResourceId = resource.Id,
            StartTime = new DateTime(2030, 1, 16, 11, 0, 0),
            EndTime = new DateTime(2030, 1, 16, 17, 0, 0)
        }, user.Id);

        Assert.True(result.IsSuccess);
    }

    [Fact]
    public async Task CreateReservation_WhenSpanningGapBetweenRules_ReturnsValidationError()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceAsync(context);
        await SeedAvailabilityRuleAsync(context, resource.Id, DayOfWeek.Wednesday, new TimeOnly(8, 0), new TimeOnly(12, 0));
        await SeedAvailabilityRuleAsync(context, resource.Id, DayOfWeek.Wednesday, new TimeOnly(13, 0), new TimeOnly(16, 0));
        var user = await SeedUserAsync(context);
        var service = CreateService(context);

        var result = await service.CreateAsync(new CreateReservationDto
        {
            ResourceId = resource.Id,
            StartTime = new DateTime(2030, 1, 16, 11, 0, 0),
            EndTime = new DateTime(2030, 1, 16, 14, 0, 0)
        }, user.Id);

        AssertError(result, ServiceErrorKind.Validation, "Resource is not available in this time period.");
    }

    [Fact]
    public async Task CreateReservation_WhenStartTimeIsInThePast_ReturnsValidationError()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceWithAvailabilityAsync(context);
        var user = await SeedUserAsync(context);
        var service = CreateService(context, localNow: new DateTime(2030, 1, 15, 10, 0, 1));

        var result = await service.CreateAsync(new CreateReservationDto
        {
            ResourceId = resource.Id,
            StartTime = new DateTime(2030, 1, 15, 10, 0, 0),
            EndTime = new DateTime(2030, 1, 15, 11, 0, 0)
        }, user.Id);

        AssertError(result, ServiceErrorKind.Validation, "Reservations must start in the future.");
    }

    [Fact]
    public async Task CreateReservation_WhenStartTimeIsNow_CreatesReservation()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceWithAvailabilityAsync(context);
        var user = await SeedUserAsync(context);
        var service = CreateService(context, localNow: new DateTime(2030, 1, 15, 10, 0, 0));

        var result = await service.CreateAsync(new CreateReservationDto
        {
            ResourceId = resource.Id,
            StartTime = new DateTime(2030, 1, 15, 10, 0, 0),
            EndTime = new DateTime(2030, 1, 15, 11, 0, 0)
        }, user.Id);

        Assert.True(result.IsSuccess);
    }

    [Fact]
    public async Task CreateReservation_WhenLongerThanTheResourcesMaximum_ReturnsValidationError()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceWithAvailabilityAsync(context);
        resource.MaxDurationMinutes = 60;
        await context.SaveChangesAsync();
        var user = await SeedUserAsync(context);
        var service = CreateService(context);

        var result = await service.CreateAsync(new CreateReservationDto
        {
            ResourceId = resource.Id,
            StartTime = new DateTime(2030, 1, 15, 9, 0, 0),
            EndTime = new DateTime(2030, 1, 15, 10, 30, 0)
        }, user.Id);

        AssertError(result, ServiceErrorKind.Validation, "Bookings can be at most 1 hour long.");
    }

    [Fact]
    public async Task CreateReservation_WhenBeyondTheBookingHorizon_ReturnsValidationError()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceWithAvailabilityAsync(context);
        var user = await SeedUserAsync(context);
        var service = CreateService(
            context,
            localNow: new DateTime(2030, 1, 1, 12, 0, 0),
            configurePolicy: policy => policy.MaxAdvanceDays = 13);

        var result = await service.CreateAsync(new CreateReservationDto
        {
            ResourceId = resource.Id,
            StartTime = new DateTime(2030, 1, 15, 10, 0, 0),
            EndTime = new DateTime(2030, 1, 15, 11, 0, 0)
        }, user.Id);

        AssertError(result, ServiceErrorKind.Validation, "Bookings can be made up to 13 days ahead.");
    }

    [Fact]
    public async Task ExistingReservation_ThatBreaksTodaysPolicies_StaysActiveAndCanBeCancelled()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceWithAvailabilityAsync(context);
        var user = await SeedUserAsync(context);
        // Ten hours, longer than the eight-hour maximum. Made before the rule existed.
        var reservation = await SeedReservationAsync(
            context,
            resource.Id,
            user.Id,
            new DateTime(2030, 1, 15, 8, 0, 0),
            new DateTime(2030, 1, 15, 18, 0, 0),
            ReservationStatuses.Active);
        var service = CreateService(context);

        var listed = Assert.Single(await service.GetForUserAsync(user.Id));
        Assert.Equal(ReservationStatuses.Active, listed.Status);

        var result = await service.CancelAsync(reservation.Id, new CurrentUser(user.Id, false));

        Assert.True(result.IsSuccess);
    }

    [Fact]
    public async Task CreateReservation_WhenUserHasTheMostUpcomingBookings_ReturnsValidationError()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceWithAvailabilityAsync(context);
        var user = await SeedUserAsync(context);
        await SeedReservationAsync(
            context, resource.Id, user.Id,
            new DateTime(2030, 1, 15, 9, 0, 0), new DateTime(2030, 1, 15, 9, 30, 0),
            ReservationStatuses.Active);
        await SeedReservationAsync(
            context, resource.Id, user.Id,
            new DateTime(2030, 1, 15, 9, 30, 0), new DateTime(2030, 1, 15, 10, 0, 0),
            ReservationStatuses.Active);
        var service = CreateService(context, configurePolicy: policy => policy.MaxActiveReservationsPerUser = 2);

        var result = await service.CreateAsync(new CreateReservationDto
        {
            ResourceId = resource.Id,
            StartTime = new DateTime(2030, 1, 15, 11, 0, 0),
            EndTime = new DateTime(2030, 1, 15, 12, 0, 0)
        }, user.Id);

        AssertError(
            result,
            ServiceErrorKind.Validation,
            "You already have 2 upcoming bookings, the most allowed. Cancel one before booking another.");
    }

    [Fact]
    public async Task CreateReservation_DoesNotCountCancelledOrFinishedBookingsTowardsTheCap()
    {
        await using var context = CreateContext();
        var resource = await SeedResourceWithAvailabilityAsync(context);
        var user = await SeedUserAsync(context);
        var otherUser = await SeedUserAsync(context);
        await SeedReservationAsync(
            context, resource.Id, user.Id,
            new DateTime(2030, 1, 15, 9, 0, 0), new DateTime(2030, 1, 15, 10, 0, 0),
            ReservationStatuses.Cancelled);
        // Ended before the test clock's "now" of 15 January 2030, 10:00.
        await SeedReservationAsync(
            context, resource.Id, user.Id,
            new DateTime(2030, 1, 14, 9, 0, 0), new DateTime(2030, 1, 14, 10, 0, 0),
            ReservationStatuses.Active);
        await SeedReservationAsync(
            context, resource.Id, otherUser.Id,
            new DateTime(2030, 1, 15, 10, 0, 0), new DateTime(2030, 1, 15, 10, 30, 0),
            ReservationStatuses.Active);
        var service = CreateService(
            context,
            localNow: new DateTime(2030, 1, 15, 10, 0, 0),
            configurePolicy: policy => policy.MaxActiveReservationsPerUser = 1);

        var result = await service.CreateAsync(new CreateReservationDto
        {
            ResourceId = resource.Id,
            StartTime = new DateTime(2030, 1, 15, 11, 0, 0),
            EndTime = new DateTime(2030, 1, 15, 12, 0, 0)
        }, user.Id);

        Assert.True(result.IsSuccess);
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

    private static async Task SeedAvailabilityRuleAsync(
        AppDbContext context,
        int resourceId,
        DayOfWeek dayOfWeek,
        TimeOnly startTime,
        TimeOnly endTime)
    {
        context.AvailabilityRules.Add(new AvailabilityRule
        {
            ResourceId = resourceId,
            DayOfWeek = dayOfWeek,
            StartTime = startTime,
            EndTime = endTime
        });
        await context.SaveChangesAsync();
    }

    private static DateTimeOffset ToUtc(DateTime localNow)
    {
        return new DateTimeOffset(
            TimeZoneInfo.ConvertTimeToUtc(localNow, TestSchedulingClock.TimeZone),
            TimeSpan.Zero);
    }

    private static AppDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        return new AppDbContext(options);
    }

    private static ReservationService CreateService(
        AppDbContext context,
        DateTime? localNow = null,
        Action<BookingPolicyOptions>? configurePolicy = null)
    {
        var clock = TestSchedulingClock.Create(localNow);
        var bookingPolicy = TestBookingPolicy.Create(configurePolicy);

        return new ReservationService(
            context,
            new AvailabilityService(context, clock, bookingPolicy),
            clock,
            Options.Create(new SchedulingOptions { TimeZoneId = "Europe/Copenhagen" }),
            bookingPolicy);
    }

    private static void AssertError<T>(ServiceResult<T> result, ServiceErrorKind kind, string message)
    {
        Assert.False(result.IsSuccess);
        Assert.Equal(kind, result.Error.Kind);
        Assert.Equal(message, result.Error.Message);
    }

    private static void AssertError(ServiceResult result, ServiceErrorKind kind, string message)
    {
        Assert.False(result.IsSuccess);
        Assert.Equal(kind, result.Error.Kind);
        Assert.Equal(message, result.Error.Message);
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

    private static async Task<Resource> SeedResourceWithAvailabilityRuleAsync(
        AppDbContext context)
    {
        var resource = new Resource
        {
            Name = "Test Resource",
            IsActive = true
        };

        context.Resources.Add(resource);
        await context.SaveChangesAsync();

        context.AvailabilityRules.Add(new AvailabilityRule
        {
            ResourceId = resource.Id,
            DayOfWeek = DayOfWeek.Wednesday,
            StartTime = new TimeOnly(8, 0),
            EndTime = new TimeOnly(16, 0)
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

    private static async Task<Reservation> SeedReservationAsync(
        AppDbContext context,
        int resourceId,
        int userId,
        DateTime startTime,
        DateTime endTime,
        string status)
    {
        var reservation = new Reservation
        {
            ResourceId = resourceId,
            UserId = userId,
            StartTime = startTime,
            EndTime = endTime,
            Status = status
        };

        context.Reservations.Add(reservation);
        await context.SaveChangesAsync();

        return reservation;
    }
}
