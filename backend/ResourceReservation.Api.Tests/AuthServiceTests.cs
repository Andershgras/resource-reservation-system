using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;
using ResourceReservation.Api.Configuration;
using ResourceReservation.Api.Data;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.Models;
using ResourceReservation.Api.Services;

namespace ResourceReservation.Api.Tests;

// Registration. Sign-in uses SQL Server features the in-memory provider
// lacks, so it is tested in the integration tests' LoginTests.
public class AuthServiceTests
{
    [Fact]
    public async Task Register_WithValidInput_CreatesUser()
    {
        await using var context = CreateContext();
        var service = CreateService(context);

        var result = await service.RegisterAsync(new RegisterUserDto
        {
            Name = "Test User",
            Email = "test@example.com",
            Password = "password123"
        });

        Assert.True(result.IsSuccess);
        var response = result.Value;
        Assert.Equal("Test User", response.Name);
        Assert.Equal("test@example.com", response.Email);
        Assert.Equal("User", response.Role);

        var savedUser = await context.Users.SingleAsync();
        Assert.Equal("User", savedUser.Role);
        Assert.NotEqual("password123", savedUser.PasswordHash);
        Assert.True(savedUser.IsActive);
        Assert.Equal(Now, savedUser.CreatedAt);
        Assert.Equal(User.SecurityStampLength, savedUser.SecurityStamp.Length);
    }

    [Fact]
    public async Task Register_WhenEmailAlreadyExists_ReturnsValidationError()
    {
        await using var context = CreateContext();
        await SeedUser(context, email: "test@example.com");
        var service = CreateService(context);

        var result = await service.RegisterAsync(new RegisterUserDto
        {
            Name = "Other User",
            Email = "TEST@example.com",
            Password = "password123"
        });

        AssertError(result, ServiceErrorKind.Validation, "Email is already registered.");
    }

    [Theory]
    [InlineData("")]
    [InlineData("not-an-email")]
    public async Task Register_WhenEmailIsInvalid_ReturnsValidationError(string email)
    {
        await using var context = CreateContext();
        var service = CreateService(context);

        var result = await service.RegisterAsync(new RegisterUserDto
        {
            Name = "Test User",
            Email = email,
            Password = "password123"
        });

        AssertError(result, ServiceErrorKind.Validation, "A valid email is required.");
    }

    [Theory]
    [InlineData("")]
    [InlineData("short")]
    public async Task Register_WhenPasswordIsTooShort_ReturnsValidationError(string password)
    {
        await using var context = CreateContext();
        var service = CreateService(context);

        var result = await service.RegisterAsync(new RegisterUserDto
        {
            Name = "Test User",
            Email = "test@example.com",
            Password = password
        });

        AssertError(result, ServiceErrorKind.Validation, "Password must be at least 8 characters.");
    }

    [Fact]
    public async Task Register_AlwaysCreatesNormalUserRole()
    {
        await using var context = CreateContext();
        var service = CreateService(context);

        var result = await service.RegisterAsync(new RegisterUserDto
        {
            Name = "Public User",
            Email = "public@example.com",
            Password = "password123"
        });

        Assert.True(result.IsSuccess);
        var response = result.Value;
        Assert.Equal("User", response.Role);

        var savedUser = await context.Users.SingleAsync();
        Assert.Equal("User", savedUser.Role);
    }

    private static readonly DateTimeOffset Now = new(2030, 1, 16, 9, 0, 0, TimeSpan.Zero);

    private static AuthService CreateService(
        AppDbContext context,
        IPasswordHasher<User>? passwordHasher = null)
    {
        var jwtOptions = Options.Create(new JwtOptions
        {
            Key = "test-jwt-key-that-is-long-enough-for-hmac",
            Issuer = "ResourceReservation.Tests",
            Audience = "ResourceReservation.Tests",
            ExpiryMinutes = 30
        });

        var timeProvider = new FakeTimeProvider(Now);

        return new AuthService(
            context,
            new JwtTokenService(jwtOptions, timeProvider),
            passwordHasher ?? new PasswordHasher<User>(),
            timeProvider,
            Options.Create(new AccountLockoutOptions()));
    }

    private static AppDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        return new AppDbContext(options);
    }

    private static async Task SeedUser(
        AppDbContext context,
        string email,
        string password = "password123",
        string role = "User")
    {
        var user = new User
        {
            Name = "Test User",
            Email = email,
            Role = role
        };

        user.PasswordHash = new PasswordHasher<User>().HashPassword(user, password);

        context.Users.Add(user);
        await context.SaveChangesAsync();
    }

    private static void AssertError<T>(ServiceResult<T> result, ServiceErrorKind kind, string message)
    {
        Assert.False(result.IsSuccess);
        Assert.Equal(kind, result.Error.Kind);
        Assert.Equal(message, result.Error.Message);
    }
}
