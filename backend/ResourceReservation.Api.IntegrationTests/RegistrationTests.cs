using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.IntegrationTests.Infrastructure;
using ResourceReservation.Api.Models;
using ResourceReservation.Api.Services;

namespace ResourceReservation.Api.IntegrationTests;

// Registration gives one answer whether or not the address has an account,
// and new accounts can't sign in until confirmed (ADR 0011).
public class RegistrationTests : ApiTestBase
{
    private const string Email = "new@integration.test";
    private const string Password = "Password123";

    public RegistrationTests(ApiFixture fixture)
        : base(fixture)
    {
    }

    [Fact]
    public async Task ANewAddress_GetsAnUnconfirmedAccountAndALink_AndCantSignInYet()
    {
        var response = await RegisterAsync(Email, "New Person", Password);

        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        Assert.Equal(AccountService.RegistrationAcceptedMessage,
            (await response.Content.ReadFromJsonAsync<AcceptedMessageDto>())!.Message);
        var user = await LoadUserAsync(Email);
        Assert.False(user.IsEmailConfirmed);
        Assert.Null(user.EmailConfirmedAt);
        Assert.NotNull(user.CreatedAt);

        var email = Assert.Single(await TestEmailSink.Instance.WaitForAsync(Email));
        Assert.Equal("Confirm your email address", email.Subject);
        Assert.Contains("https://app.integration.test/verify-email#token=", email.TextBody);
        var token = TestEmailSink.TokenFrom(email);
        Assert.Equal(UserTokenService.TokenLength, token.Length);
        // Only the hash is stored.
        await using (var context = Fixture.CreateDbContext())
        {
            var stored = await context.UserTokens.SingleAsync();
            Assert.Equal(UserTokenService.HashToken(token), stored.TokenHash);
            Assert.NotEqual(token, stored.TokenHash);
            Assert.Equal(UserTokenPurposes.EmailVerification, stored.Purpose);
            Assert.Equal(TimeSpan.FromHours(24), stored.ExpiresAt - stored.CreatedAt);
        }

        var signIn = await SignInAsync(Email, Password);
        await ProblemAssert.IsProblemAsync(signIn, HttpStatusCode.Forbidden, AuthService.EmailNotConfirmedMessage);
        Assert.DoesNotContain("token", await signIn.Content.ReadAsStringAsync(), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task AWrongPasswordForAnUnconfirmedAccount_GetsTheGenericAnswer()
    {
        await RegisterAsync(Email, "New Person", Password);

        await ProblemAssert.IsProblemAsync(
            await SignInAsync(Email, "WrongPassword123"),
            HttpStatusCode.Unauthorized,
            AuthService.InvalidCredentialsMessage);
    }

    [Fact]
    public async Task AnAddressWithAnAccount_GetsTheSameAnswer_AndItsOwnerANotice_AndNothingChanges()
    {
        var existing = await SeedConfirmedUserAsync(Email, "Owner");
        var before = await LoadUserAsync(Email);

        var forExisting = await RegisterAsync(Email, "Someone Else", "OtherPassword123");
        var forNew = await RegisterAsync("other-new@integration.test", "Someone Else", "OtherPassword123");

        Assert.Equal(forNew.StatusCode, forExisting.StatusCode);
        Assert.Equal(await forNew.Content.ReadAsStringAsync(), await forExisting.Content.ReadAsStringAsync());
        var after = await LoadUserAsync(Email);
        Assert.Equal((before.Name, before.PasswordHash, before.SecurityStamp, before.IsEmailConfirmed),
            (after.Name, after.PasswordHash, after.SecurityStamp, after.IsEmailConfirmed));
        var notice = Assert.Single(await TestEmailSink.Instance.WaitForAsync(Email));
        Assert.Equal("Someone tried to register with your email", notice.Subject);
        Assert.DoesNotContain("#token=", notice.TextBody);
        Assert.Equal(HttpStatusCode.OK, (await SignInAsync(Email, Password)).StatusCode);
        Assert.Equal(existing.Id, after.Id);
    }

    // Someone registers an address first. A second registration of it can't
    // replace the waiting account's name or password.
    [Fact]
    public async Task RegisteringAnUnconfirmedAddressAgain_ChangesNothing()
    {
        await RegisterAsync(Email, "First", Password);
        var before = await LoadUserAsync(Email);
        var firstLink = TestEmailSink.TokenFrom(Assert.Single(await TestEmailSink.Instance.WaitForAsync(Email)));

        var again = await RegisterAsync(Email, "Second", "SecondPassword123");

        Assert.Equal(HttpStatusCode.Accepted, again.StatusCode);
        var after = await LoadUserAsync(Email);
        Assert.Equal((before.Name, before.PasswordHash), (after.Name, after.PasswordHash));
        var emails = await TestEmailSink.Instance.WaitForAsync(Email, count: 2);
        Assert.Equal("Someone tried to register with your email", emails[1].Subject);
        // The first link still works, with the first password.
        Assert.Equal(HttpStatusCode.NoContent, (await CreateAnonymousClient().PostAsJsonAsync(
            "/api/auth/verify-email",
            new VerifyEmailDto { Token = firstLink, Password = Password })).StatusCode);
    }

    [Fact]
    public async Task ParallelRegistrationsOfOneAddress_CreateOneAccountAndSendOneLink()
    {
        const int parallelRequests = 10;
        var client = CreateAnonymousClient();

        var responses = await Task.WhenAll(Enumerable.Range(0, parallelRequests)
            .Select(index => client.PostAsJsonAsync("/api/auth/register", new RegisterUserDto
            {
                Name = $"Racer {index}",
                Email = Email,
                Password = Password
            })));

        Assert.All(responses, response => Assert.Equal(HttpStatusCode.Accepted, response.StatusCode));
        await using var context = Fixture.CreateDbContext();
        Assert.Equal(1, await context.Users.CountAsync(user => user.Email == Email));
        await TestEmailSink.Instance.WaitForAsync(Email);
        await TestEmailSink.SettleAsync();
        var emails = TestEmailSink.Instance.Messages.Where(message => message.ToAddress == Email).ToList();
        Assert.Single(emails, email => email.Subject == "Confirm your email address");
        // The losers each tried to send a notice; the cooldown lets one through.
        Assert.InRange(emails.Count(email => email.Subject == "Someone tried to register with your email"), 0, 1);
    }

    [Fact]
    public async Task AMixedCaseAddress_IsStoredNormalized()
    {
        var response = await RegisterAsync("  Mixed.Case@Integration.Test ", "Mixed Case", Password);

        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        await LoadUserAsync("mixed.case@integration.test");
        await ConfirmEmailAsync("mixed.case@integration.test");
        Assert.Equal(HttpStatusCode.OK, (await SignInAsync("MIXED.CASE@integration.test", Password)).StatusCode);
    }

    // Whether an address has an account changes the database work by a few
    // milliseconds. Every request that may send an email takes at least the
    // minimum, which hides that.
    [Fact]
    public async Task RequestsThatMaySendEmail_AnswerNoSoonerThanTheMinimum()
    {
        await SeedConfirmedUserAsync(Email, "Owner");
        await using var factory = new ApiFactory(Fixture.ConnectionString, new Dictionary<string, string>
        {
            ["AccountTokens:MinimumResponseMilliseconds"] = "300"
        });
        var client = factory.CreateBrowserClient();
        var requests = new (string Path, object Body)[]
        {
            ("/api/auth/register", new RegisterUserDto { Name = "A", Email = Email, Password = Password }),
            ("/api/auth/register", new RegisterUserDto { Name = "B", Email = "brand-new@integration.test", Password = Password }),
            ("/api/auth/forgot-password", new AccountEmailRequestDto { Email = Email }),
            ("/api/auth/forgot-password", new AccountEmailRequestDto { Email = "nobody@integration.test" }),
            ("/api/auth/resend-verification", new AccountEmailRequestDto { Email = "brand-new@integration.test" }),
            ("/api/auth/resend-verification", new AccountEmailRequestDto { Email = "nobody@integration.test" })
        };

        foreach (var (path, body) in requests)
        {
            var started = System.Diagnostics.Stopwatch.StartNew();
            var response = await client.PostAsJsonAsync(path, body);

            Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
            Assert.True(started.ElapsedMilliseconds >= 300, $"{path} answered after {started.ElapsedMilliseconds} ms.");
        }
    }

    private Task<HttpResponseMessage> RegisterAsync(string email, string name, string password)
    {
        return CreateAnonymousClient().PostAsJsonAsync("/api/auth/register", new RegisterUserDto
        {
            Name = name,
            Email = email,
            Password = password
        });
    }

    private Task<HttpResponseMessage> SignInAsync(string email, string password)
    {
        return CreateAnonymousClient().PostAsJsonAsync("/api/auth/login", new LoginUserDto
        {
            Email = email,
            Password = password
        });
    }

    private async Task<User> SeedConfirmedUserAsync(string email, string name)
    {
        await using var context = Fixture.CreateDbContext();
        var user = new User { Name = name, Email = email, IsEmailConfirmed = true };
        user.PasswordHash = new PasswordHasher<User>().HashPassword(user, Password);
        context.Users.Add(user);
        await context.SaveChangesAsync();

        return user;
    }

    private async Task<User> LoadUserAsync(string email)
    {
        await using var context = Fixture.CreateDbContext();

        return await context.Users.AsNoTracking().SingleAsync(user => user.Email == email);
    }
}
