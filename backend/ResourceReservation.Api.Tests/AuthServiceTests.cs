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
        Assert.Equal(Now.AddMinutes(30), response.ExpiresAt);
        Assert.Equal(30 * 60, response.ExpiresInSeconds);
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

    [Theory]
    [InlineData("test@example.com", "wrongpassword")]
    [InlineData("test@example.com", "password123")]
    [InlineData("missing@example.com", "password123")]
    public async Task Login_ForExistingAndUnknownEmail_VerifiesPasswordOnce(string email, string password)
    {
        await using var context = CreateContext();
        await SeedUser(context, email: "test@example.com", password: "password123");
        var hasher = new RecordingPasswordHasher();
        var service = CreateService(context, hasher);

        await service.LoginAsync(new LoginUserDto { Email = email, Password = password });

        var verification = Assert.Single(hasher.Verifications);
        Assert.Equal(password, verification.ProvidedPassword);
    }

    [Fact]
    public async Task Login_WithUnknownEmail_VerifiesAgainstHashWithSameFormatAndWorkFactor()
    {
        await using var context = CreateContext();
        await SeedUser(context, email: "test@example.com", password: "password123");
        var hasher = new RecordingPasswordHasher();
        var service = CreateService(context, hasher);

        await service.LoginAsync(new LoginUserDto { Email = "test@example.com", Password = "wrongpassword" });
        var result = await service.LoginAsync(new LoginUserDto { Email = "missing@example.com", Password = "password123" });

        AssertError(result, ServiceErrorKind.Unauthorized, "Invalid email or password.");
        var realHash = Convert.FromBase64String(hasher.Verifications[0].HashedPassword);
        var unknownUserHash = Convert.FromBase64String(hasher.Verifications[1].HashedPassword);
        // Identity's V3 format starts with a format marker, the PRF, the iteration
        // count and the salt size, followed by the salt and the subkey.
        Assert.Equal(realHash.Length, unknownUserHash.Length);
        Assert.Equal(realHash[..13], unknownUserHash[..13]);
    }

    [Fact]
    public async Task Login_WithUnknownEmail_CreatesTheUnknownUserHashOnlyOnce()
    {
        await using var context = CreateContext();
        var hasher = new RecordingPasswordHasher();
        var service = CreateService(context, hasher);

        await service.LoginAsync(new LoginUserDto { Email = "first@example.com", Password = "password123" });
        await service.LoginAsync(new LoginUserDto { Email = "second@example.com", Password = "password123" });

        Assert.Equal(1, hasher.HashCount);
        Assert.Equal(2, hasher.Verifications.Count);
        Assert.Equal(hasher.Verifications[0].HashedPassword, hasher.Verifications[1].HashedPassword);
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

        return new AuthService(
            context,
            new JwtTokenService(jwtOptions, new FakeTimeProvider(Now)),
            passwordHasher ?? new PasswordHasher<User>());
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

    // The real hasher, recording each call.
    private sealed class RecordingPasswordHasher : IPasswordHasher<User>
    {
        private readonly PasswordHasher<User> _inner = new();

        public int HashCount { get; private set; }

        public List<(string HashedPassword, string ProvidedPassword)> Verifications { get; } = [];

        public string HashPassword(User user, string password)
        {
            HashCount++;

            return _inner.HashPassword(user, password);
        }

        public PasswordVerificationResult VerifyHashedPassword(User user, string hashedPassword, string providedPassword)
        {
            Verifications.Add((hashedPassword, providedPassword));

            return _inner.VerifyHashedPassword(user, hashedPassword, providedPassword);
        }
    }

    private static void AssertError<T>(ServiceResult<T> result, ServiceErrorKind kind, string message)
    {
        Assert.False(result.IsSuccess);
        Assert.Equal(kind, result.Error.Kind);
        Assert.Equal(message, result.Error.Message);
    }
}
