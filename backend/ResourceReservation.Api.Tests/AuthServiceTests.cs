using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using ResourceReservation.Api.Configuration;
using ResourceReservation.Api.Data;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.Models;
using ResourceReservation.Api.Services;

namespace ResourceReservation.Api.Tests;

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
    public async Task Login_WithValidCredentials_ReturnsTokenAndUser()
    {
        await using var context = CreateContext();
        await SeedUser(context, email: "test@example.com", password: "password123");
        var service = CreateService(context);

        var result = await service.LoginAsync(new LoginUserDto
        {
            Email = "test@example.com",
            Password = "password123"
        });

        Assert.True(result.IsSuccess);
        var response = result.Value;
        Assert.False(string.IsNullOrWhiteSpace(response.Token));
        Assert.Equal("test@example.com", response.User.Email);
        Assert.Equal("User", response.User.Role);
    }

    [Theory]
    [InlineData("missing@example.com", "password123")]
    [InlineData("test@example.com", "wrongpassword")]
    public async Task Login_WithInvalidCredentials_ReturnsUnauthorized(string email, string password)
    {
        await using var context = CreateContext();
        await SeedUser(context, email: "test@example.com", password: "password123");
        var service = CreateService(context);

        var result = await service.LoginAsync(new LoginUserDto
        {
            Email = email,
            Password = password
        });

        AssertError(result, ServiceErrorKind.Unauthorized, "Invalid email or password.");
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

    private static AuthService CreateService(AppDbContext context)
    {
        var jwtOptions = Options.Create(new JwtOptions
        {
            Key = "test-jwt-key-that-is-long-enough-for-hmac",
            Issuer = "ResourceReservation.Tests",
            Audience = "ResourceReservation.Tests"
        });

        return new AuthService(context, new JwtTokenService(jwtOptions, TimeProvider.System));
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
