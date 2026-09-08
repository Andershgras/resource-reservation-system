using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using ResourceReservation.Api.Controllers;
using ResourceReservation.Api.Data;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.Models;

namespace ResourceReservation.Api.Tests;

public class AuthControllerTests
{
    [Fact]
    public async Task Register_WithValidInput_CreatesUser()
    {
        await using var context = CreateContext();
        var controller = CreateController(context);

        var result = await controller.Register(new RegisterUserDto
        {
            Name = "Test User",
            Email = "test@example.com",
            Password = "password123"
        });

        var created = Assert.IsType<CreatedAtActionResult>(result.Result);
        var response = Assert.IsType<UserResponseDto>(created.Value);
        Assert.Equal("Test User", response.Name);
        Assert.Equal("test@example.com", response.Email);
        Assert.Equal("User", response.Role);

        var savedUser = await context.Users.SingleAsync();
        Assert.Equal("User", savedUser.Role);
        Assert.NotEqual("password123", savedUser.PasswordHash);
    }

    [Fact]
    public async Task Register_WhenEmailAlreadyExists_ReturnsBadRequest()
    {
        await using var context = CreateContext();
        await SeedUser(context, email: "test@example.com");
        var controller = CreateController(context);

        var result = await controller.Register(new RegisterUserDto
        {
            Name = "Other User",
            Email = "TEST@example.com",
            Password = "password123"
        });

        var badRequest = Assert.IsType<BadRequestObjectResult>(result.Result);
        AssertApiError(badRequest, "Email is already registered.");
    }

    [Theory]
    [InlineData("")]
    [InlineData("not-an-email")]
    public async Task Register_WhenEmailIsInvalid_ReturnsBadRequest(string email)
    {
        await using var context = CreateContext();
        var controller = CreateController(context);

        var result = await controller.Register(new RegisterUserDto
        {
            Name = "Test User",
            Email = email,
            Password = "password123"
        });

        var badRequest = Assert.IsType<BadRequestObjectResult>(result.Result);
        AssertApiError(badRequest, "A valid email is required.");
    }

    [Theory]
    [InlineData("")]
    [InlineData("short")]
    public async Task Register_WhenPasswordIsTooShort_ReturnsBadRequest(string password)
    {
        await using var context = CreateContext();
        var controller = CreateController(context);

        var result = await controller.Register(new RegisterUserDto
        {
            Name = "Test User",
            Email = "test@example.com",
            Password = password
        });

        var badRequest = Assert.IsType<BadRequestObjectResult>(result.Result);
        AssertApiError(badRequest, "Password must be at least 8 characters.");
    }

    [Fact]
    public async Task Login_WithValidCredentials_ReturnsTokenAndUser()
    {
        await using var context = CreateContext();
        await SeedUser(context, email: "test@example.com", password: "password123");
        var controller = CreateController(context);

        var result = await controller.Login(new LoginUserDto
        {
            Email = "test@example.com",
            Password = "password123"
        });

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var response = Assert.IsType<AuthResponseDto>(ok.Value);
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
        var controller = CreateController(context);

        var result = await controller.Login(new LoginUserDto
        {
            Email = email,
            Password = password
        });

        var unauthorized = Assert.IsType<UnauthorizedObjectResult>(result.Result);
        AssertApiError(unauthorized, "Invalid email or password.");
    }

    [Fact]
    public async Task Register_AlwaysCreatesNormalUserRole()
    {
        await using var context = CreateContext();
        var controller = CreateController(context);

        var result = await controller.Register(new RegisterUserDto
        {
            Name = "Public User",
            Email = "public@example.com",
            Password = "password123"
        });

        var created = Assert.IsType<CreatedAtActionResult>(result.Result);
        var response = Assert.IsType<UserResponseDto>(created.Value);
        Assert.Equal("User", response.Role);

        var savedUser = await context.Users.SingleAsync();
        Assert.Equal("User", savedUser.Role);
    }

    private static AuthController CreateController(AppDbContext context)
    {
        return new AuthController(context, CreateConfiguration());
    }

    private static IConfiguration CreateConfiguration()
    {
        return new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Key"] = "test-jwt-key-that-is-long-enough-for-hmac",
                ["Jwt:Issuer"] = "ResourceReservation.Tests",
                ["Jwt:Audience"] = "ResourceReservation.Tests"
            })
            .Build();
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

    private static void AssertApiError(ObjectResult objectResult, string expectedMessage)
    {
        var error = Assert.IsType<ApiErrorResponseDto>(objectResult.Value);
        Assert.Equal(expectedMessage, error.Message);
    }
}
