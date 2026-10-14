using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.IntegrationTests.Infrastructure;
using ResourceReservation.Api.Models;
using ResourceReservation.Api.Services;

namespace ResourceReservation.Api.IntegrationTests;

// Sign-in against SQL Server: lockout, deactivation, account enumeration,
// concurrent attempts and password re-hashing (ADR 0010).
public class LoginTests : ApiTestBase
{
    private const string Email = "login@integration.test";
    private const string Password = "LoginPassword123";
    private const string WrongPassword = "WrongPassword123";
    private const int MaxFailedAttempts = 5;

    public LoginTests(ApiFixture fixture)
        : base(fixture)
    {
    }

    [Fact]
    public async Task Login_ReturnsATokenWithAFingerprintOfTheStampButNeverTheStamp()
    {
        var user = await SeedUserAsync();

        var response = await LoginAsync(CreateAnonymousClient(), Password);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var json = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain(user.SecurityStamp, json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("securityStamp", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("passwordHash", json, StringComparison.OrdinalIgnoreCase);
        var auth = await response.Content.ReadFromJsonAsync<AuthResponseDto>();
        var fingerprint = new JwtSecurityTokenHandler().ReadJwtToken(auth!.Token).Claims
            .Single(claim => claim.Type == UserSessionValidator.SecurityStampClaimType).Value;
        Assert.Equal(UserSessionValidator.FingerprintSecurityStamp(user.SecurityStamp), fingerprint);
        Assert.NotEqual(user.SecurityStamp, fingerprint);
    }

    [Fact]
    public async Task UnknownEmailWrongPasswordAndLockedAccount_GetTheSameAnswer()
    {
        await SeedUserAsync();
        await SeedUserAsync("locked@integration.test", lockoutEndsAt: DateTimeOffset.UtcNow.AddMinutes(10));
        var client = CreateAnonymousClient();

        var responses = new[]
        {
            await LoginAsync(client, WrongPassword),
            await LoginAsync(client, Password, "missing@integration.test"),
            await LoginAsync(client, Password, "locked@integration.test"),
            await LoginAsync(client, WrongPassword, "locked@integration.test")
        };

        foreach (var response in responses)
        {
            await ProblemAssert.IsProblemAsync(response, HttpStatusCode.Unauthorized, AuthService.InvalidCredentialsMessage);
        }
    }

    [Fact]
    public async Task RepeatedFailures_LockTheAccountEvenForTheRightPassword()
    {
        var user = await SeedUserAsync();
        var client = CreateAnonymousClient();
        var before = DateTimeOffset.UtcNow;

        for (var attempt = 0; attempt < MaxFailedAttempts; attempt++)
        {
            await ProblemAssert.IsProblemAsync(
                await LoginAsync(client, WrongPassword),
                HttpStatusCode.Unauthorized,
                AuthService.InvalidCredentialsMessage);
        }

        await ProblemAssert.IsProblemAsync(
            await LoginAsync(client, Password),
            HttpStatusCode.Unauthorized,
            AuthService.InvalidCredentialsMessage);
        var locked = await ReloadAsync(user.Id);
        Assert.Equal(0, locked.FailedLoginCount);
        Assert.InRange(locked.LockoutEndsAt!.Value, before.AddMinutes(15), DateTimeOffset.UtcNow.AddMinutes(15));
    }

    [Fact]
    public async Task FailuresBelowTheLimit_AreForgottenAfterASuccess()
    {
        var user = await SeedUserAsync();
        var client = CreateAnonymousClient();

        for (var attempt = 0; attempt < MaxFailedAttempts - 1; attempt++)
        {
            await LoginAsync(client, WrongPassword);
        }

        Assert.Equal(HttpStatusCode.OK, (await LoginAsync(client, Password)).StatusCode);
        Assert.Equal(0, (await ReloadAsync(user.Id)).FailedLoginCount);

        for (var attempt = 0; attempt < MaxFailedAttempts - 1; attempt++)
        {
            await LoginAsync(client, WrongPassword);
        }

        Assert.Equal(HttpStatusCode.OK, (await LoginAsync(client, Password)).StatusCode);
    }

    [Fact]
    public async Task AttemptsDuringALockout_DoNotExtendIt()
    {
        var lockoutEndsAt = DateTimeOffset.UtcNow.AddMinutes(10);
        var user = await SeedUserAsync(lockoutEndsAt: lockoutEndsAt);
        var client = CreateAnonymousClient();

        for (var attempt = 0; attempt < MaxFailedAttempts * 2; attempt++)
        {
            await LoginAsync(client, attempt % 2 == 0 ? WrongPassword : Password);
        }

        var reloaded = await ReloadAsync(user.Id);
        Assert.Equal(lockoutEndsAt, reloaded.LockoutEndsAt!.Value, TimeSpan.FromMilliseconds(1));
        Assert.Equal(0, reloaded.FailedLoginCount);
    }

    [Fact]
    public async Task ALockout_EndsAfterItsDuration()
    {
        var user = await SeedUserAsync();
        var clock = new FakeTimeProvider(DateTimeOffset.UtcNow);
        await using var factory = Fixture.Factory.WithWebHostBuilder(builder =>
            builder.ConfigureServices(services => services.AddSingleton<TimeProvider>(clock)));
        var client = factory.CreateClient();

        for (var attempt = 0; attempt < MaxFailedAttempts; attempt++)
        {
            await LoginAsync(client, WrongPassword);
        }

        clock.Advance(TimeSpan.FromMinutes(15) - TimeSpan.FromSeconds(1));
        Assert.Equal(HttpStatusCode.Unauthorized, (await LoginAsync(client, Password)).StatusCode);
        clock.Advance(TimeSpan.FromSeconds(1));
        Assert.Equal(HttpStatusCode.OK, (await LoginAsync(client, Password)).StatusCode);
        var reloaded = await ReloadAsync(user.Id);
        Assert.Equal((0, null), (reloaded.FailedLoginCount, reloaded.LockoutEndsAt));
    }

    [Fact]
    public async Task ConcurrentFailures_AreEachCountedOnce()
    {
        var user = await SeedUserAsync();
        var client = CreateAnonymousClient();

        await Task.WhenAll(Enumerable.Range(0, MaxFailedAttempts - 1)
            .Select(_ => LoginAsync(client, WrongPassword)));

        var reloaded = await ReloadAsync(user.Id);
        Assert.Equal((MaxFailedAttempts - 1, null), (reloaded.FailedLoginCount, reloaded.LockoutEndsAt));
    }

    [Fact]
    public async Task ConcurrentFailuresPastTheLimit_LockOnceAndLetNoCorrectPasswordIn()
    {
        var user = await SeedUserAsync();
        var client = CreateAnonymousClient();

        // Correct and wrong passwords race. Whatever the order, the account
        // ends up locked once, with a consistent count.
        var responses = await Task.WhenAll(Enumerable.Range(0, MaxFailedAttempts * 3)
            .Select(_ => LoginAsync(client, WrongPassword))
            .Concat(Enumerable.Range(0, MaxFailedAttempts).Select(_ => LoginAsync(client, Password))));

        var reloaded = await ReloadAsync(user.Id);
        Assert.NotNull(reloaded.LockoutEndsAt);
        Assert.InRange(reloaded.FailedLoginCount, 0, MaxFailedAttempts - 1);
        await ProblemAssert.IsProblemAsync(
            await LoginAsync(client, Password),
            HttpStatusCode.Unauthorized,
            AuthService.InvalidCredentialsMessage);
        Assert.All(
            responses.Where(response => response.StatusCode != HttpStatusCode.OK),
            response => Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode));
    }

    // The account is locked after the right password was checked but before
    // the token was issued. No token may come from the out-of-date read.
    [Fact]
    public async Task ALockoutThatLandsDuringASignIn_StopsIt()
    {
        var user = await SeedUserAsync();
        var hasher = new GatedPasswordHasher();
        await using var factory = CreateFactoryWithHasher(hasher);

        var signIn = LoginAsync(factory.CreateClient(), Password);
        await hasher.Verifying.Task.WaitAsync(TimeSpan.FromSeconds(30));
        await UpdateUserAsync(user.Id, stored => stored.LockoutEndsAt = DateTimeOffset.UtcNow.AddMinutes(15));
        hasher.Release.SetResult();

        await ProblemAssert.IsProblemAsync(await signIn, HttpStatusCode.Unauthorized, AuthService.InvalidCredentialsMessage);
    }

    [Fact]
    public async Task ADeactivationThatLandsDuringASignIn_StopsIt()
    {
        var user = await SeedUserAsync();
        var hasher = new GatedPasswordHasher();
        await using var factory = CreateFactoryWithHasher(hasher);

        var signIn = LoginAsync(factory.CreateClient(), Password);
        await hasher.Verifying.Task.WaitAsync(TimeSpan.FromSeconds(30));
        await UpdateUserAsync(user.Id, stored =>
        {
            stored.IsActive = false;
            stored.SecurityStamp = User.NewSecurityStamp();
        });
        hasher.Release.SetResult();

        Assert.Equal(HttpStatusCode.Unauthorized, (await signIn).StatusCode);
    }

    [Fact]
    public async Task DeactivatedAccount_IsOnlyReportedAfterTheRightPassword()
    {
        var user = await SeedUserAsync(isActive: false);
        var client = CreateAnonymousClient();

        await ProblemAssert.IsProblemAsync(
            await LoginAsync(client, WrongPassword),
            HttpStatusCode.Unauthorized,
            AuthService.InvalidCredentialsMessage);
        var rightPassword = await LoginAsync(client, Password);

        await ProblemAssert.IsProblemAsync(rightPassword, HttpStatusCode.Forbidden, AuthService.DeactivatedMessage);
        Assert.DoesNotContain("token", await rightPassword.Content.ReadAsStringAsync(), StringComparison.OrdinalIgnoreCase);
        // Wrong passwords count towards a lockout like any other account's.
        Assert.Equal(1, (await ReloadAsync(user.Id)).FailedLoginCount);
    }

    [Fact]
    public async Task DeactivatedAndLockedAccount_GetsTheGenericAnswer()
    {
        await SeedUserAsync(isActive: false, lockoutEndsAt: DateTimeOffset.UtcNow.AddMinutes(10));

        await ProblemAssert.IsProblemAsync(
            await LoginAsync(CreateAnonymousClient(), Password),
            HttpStatusCode.Unauthorized,
            AuthService.InvalidCredentialsMessage);
    }

    [Theory]
    [InlineData(Email, WrongPassword)]
    [InlineData(Email, Password)]
    [InlineData("missing@integration.test", Password)]
    [InlineData("locked@integration.test", WrongPassword)]
    public async Task EverySignIn_VerifiesExactlyOnePasswordHash(string email, string password)
    {
        await SeedUserAsync();
        await SeedUserAsync("locked@integration.test", lockoutEndsAt: DateTimeOffset.UtcNow.AddMinutes(10));
        var hasher = new RecordingPasswordHasher();
        await using var factory = CreateFactoryWithHasher(hasher);

        await LoginAsync(factory.CreateClient(), password, email);

        Assert.Equal(password, Assert.Single(hasher.Verifications).ProvidedPassword);
    }

    [Fact]
    public async Task UnknownEmails_AreCheckedAgainstAHashWithTheSameFormatAndWorkFactor()
    {
        await SeedUserAsync();
        var hasher = new RecordingPasswordHasher();
        await using var factory = CreateFactoryWithHasher(hasher);
        var client = factory.CreateClient();

        await LoginAsync(client, WrongPassword);
        await LoginAsync(client, Password, "first-missing@integration.test");
        await LoginAsync(client, Password, "second-missing@integration.test");

        var realHash = Convert.FromBase64String(hasher.Verifications[0].HashedPassword);
        var unknownUserHash = Convert.FromBase64String(hasher.Verifications[1].HashedPassword);
        // Identity's V3 format starts with a format marker, the PRF, the iteration
        // count and the salt size, followed by the salt and the subkey.
        Assert.Equal(realHash.Length, unknownUserHash.Length);
        Assert.Equal(realHash[..13], unknownUserHash[..13]);
        // The stand-in hash is made once and reused.
        Assert.Equal(hasher.Verifications[1].HashedPassword, hasher.Verifications[2].HashedPassword);
        Assert.Equal(1, hasher.HashCount);
    }

    [Fact]
    public async Task AnOldFormatHash_IsReplacedOnSignIn()
    {
        var oldHasher = new PasswordHasher<User>(Options.Create(new PasswordHasherOptions
        {
            CompatibilityMode = PasswordHasherCompatibilityMode.IdentityV2
        }));
        var user = await SeedUserAsync(passwordHasher: oldHasher);
        var client = CreateAnonymousClient();

        Assert.Equal(HttpStatusCode.OK, (await LoginAsync(client, Password)).StatusCode);

        var rehashed = await ReloadAsync(user.Id);
        Assert.NotEqual(user.PasswordHash, rehashed.PasswordHash);
        // 0x01 marks Identity's V3 format.
        Assert.Equal(0x01, Convert.FromBase64String(rehashed.PasswordHash)[0]);
        Assert.Equal(HttpStatusCode.OK, (await LoginAsync(client, Password)).StatusCode);
    }

    // The password changes after the old hash was verified. The re-hash of the
    // old password must not overwrite the new one.
    [Fact]
    public async Task ReHashing_NeverOverwritesANewerPassword()
    {
        var oldHasher = new PasswordHasher<User>(Options.Create(new PasswordHasherOptions
        {
            CompatibilityMode = PasswordHasherCompatibilityMode.IdentityV2
        }));
        var user = await SeedUserAsync(passwordHasher: oldHasher);
        var newerHash = new PasswordHasher<User>().HashPassword(user, "NewerPassword123");
        var hasher = new GatedPasswordHasher();
        await using var factory = CreateFactoryWithHasher(hasher);

        var signIn = LoginAsync(factory.CreateClient(), Password);
        await hasher.Verifying.Task.WaitAsync(TimeSpan.FromSeconds(30));
        await UpdateUserAsync(user.Id, stored => stored.PasswordHash = newerHash);
        hasher.Release.SetResult();

        Assert.Equal(HttpStatusCode.OK, (await signIn).StatusCode);
        Assert.Equal(newerHash, (await ReloadAsync(user.Id)).PasswordHash);
    }

    private static Task<HttpResponseMessage> LoginAsync(HttpClient client, string password, string email = Email)
    {
        return client.PostAsJsonAsync("/api/auth/login", new LoginUserDto { Email = email, Password = password });
    }

    private async Task<User> SeedUserAsync(
        string email = Email,
        bool isActive = true,
        DateTimeOffset? lockoutEndsAt = null,
        IPasswordHasher<User>? passwordHasher = null)
    {
        await using var context = Fixture.CreateDbContext();
        var user = new User
        {
            Name = "Login User",
            Email = email,
            IsActive = isActive,
            LockoutEndsAt = lockoutEndsAt
        };

        user.PasswordHash = (passwordHasher ?? new PasswordHasher<User>()).HashPassword(user, Password);
        context.Users.Add(user);
        await context.SaveChangesAsync();

        return user;
    }

    private async Task<User> ReloadAsync(int userId)
    {
        await using var context = Fixture.CreateDbContext();

        return await context.Users.AsNoTracking().SingleAsync(user => user.Id == userId);
    }

    private async Task UpdateUserAsync(int userId, Action<User> change)
    {
        await using var context = Fixture.CreateDbContext();
        var user = await context.Users.SingleAsync(stored => stored.Id == userId);
        change(user);
        await context.SaveChangesAsync();
    }

    private WebApplicationFactory<Program> CreateFactoryWithHasher(IPasswordHasher<User> hasher)
    {
        return Fixture.Factory.WithWebHostBuilder(builder =>
            builder.ConfigureServices(services => services.AddSingleton(hasher)));
    }

    // The real hasher, recording each verification.
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

    // The real hasher, but a verification waits until the test releases it,
    // so the test can change the account in the middle of a sign-in.
    private sealed class GatedPasswordHasher : IPasswordHasher<User>
    {
        private readonly PasswordHasher<User> _inner = new();

        public TaskCompletionSource Verifying { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public TaskCompletionSource Release { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public string HashPassword(User user, string password)
        {
            return _inner.HashPassword(user, password);
        }

        public PasswordVerificationResult VerifyHashedPassword(User user, string hashedPassword, string providedPassword)
        {
            Verifying.TrySetResult();

            if (!Release.Task.Wait(TimeSpan.FromSeconds(30)))
            {
                throw new TimeoutException("The test never released the password check.");
            }

            return _inner.VerifyHashedPassword(user, hashedPassword, providedPassword);
        }
    }
}
