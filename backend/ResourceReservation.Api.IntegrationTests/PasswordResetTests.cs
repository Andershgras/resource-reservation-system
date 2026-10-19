using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.IntegrationTests.Infrastructure;
using ResourceReservation.Api.Models;
using ResourceReservation.Api.Services;

namespace ResourceReservation.Api.IntegrationTests;

// Forgotten passwords: a generic request, a single-use link, and a reset that
// ends every session (ADR 0011).
public class PasswordResetTests : ApiTestBase
{
    private const string Email = "reset@integration.test";
    private const string OldPassword = "OldPassword123";
    private const string NewPassword = "NewPassword456";

    public PasswordResetTests(ApiFixture fixture)
        : base(fixture)
    {
    }

    [Fact]
    public async Task AReset_ChangesThePassword_EndsSessions_AndClearsALockout()
    {
        await SeedUserAsync(confirmed: true);
        var signedIn = await SignInAsync(OldPassword);
        await using (var context = Fixture.CreateDbContext())
        {
            await context.Users.ExecuteUpdateAsync(setters => setters
                .SetProperty(user => user.FailedLoginCount, 3));
        }

        var token = await RequestLinkAsync();
        var check = await CreateAnonymousClient().PostAsJsonAsync("/api/auth/reset-password/check",
            new PasswordResetTokenDto { Token = token });
        var reset = await ResetAsync(token, NewPassword);

        Assert.False((await check.Content.ReadFromJsonAsync<PasswordResetTokenStatusDto>())!.CompletesRegistration);
        Assert.Equal(HttpStatusCode.NoContent, reset.StatusCode);
        // The session from before the reset is over.
        Assert.Equal(HttpStatusCode.Unauthorized, (await signedIn.GetAsync("/api/reservations/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await SignInResponseAsync(OldPassword)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await SignInResponseAsync(NewPassword)).StatusCode);
        Assert.Equal(0, (await LoadUserAsync()).FailedLoginCount);
        var notice = await TestEmailSink.Instance.WaitForAsync(Email, message => message.Subject == "Your password was changed");
        Assert.DoesNotContain("#token=", Assert.Single(notice).TextBody);
        await ProblemAssert.IsProblemAsync(await ResetAsync(token, "AnotherPassword789"),
            HttpStatusCode.BadRequest, AccountService.InvalidLinkMessage);
    }

    [Fact]
    public async Task OneLinkUsedTenTimesAtOnce_ResetsOnce()
    {
        await SeedUserAsync(confirmed: true);
        var token = await RequestLinkAsync();
        var client = CreateAnonymousClient();

        var responses = await Task.WhenAll(Enumerable.Range(0, 10)
            .Select(index => client.PostAsJsonAsync("/api/auth/reset-password", new ResetPasswordDto
            {
                Token = token,
                Password = $"Parallel{index}Password"
            })));

        var winner = Assert.Single(responses, response => response.StatusCode == HttpStatusCode.NoContent);
        Assert.Equal(9, responses.Count(response => response.StatusCode == HttpStatusCode.BadRequest));
        var winningPassword = $"Parallel{Array.IndexOf(responses, winner)}Password";
        Assert.Equal(HttpStatusCode.OK, (await SignInResponseAsync(winningPassword)).StatusCode);
    }

    [Fact]
    public async Task AnExpiredLink_DoesNotWork()
    {
        await SeedUserAsync(confirmed: true);
        var token = await RequestLinkAsync();
        await using (var context = Fixture.CreateDbContext())
        {
            var stored = await context.UserTokens.SingleAsync();
            Assert.Equal(TimeSpan.FromHours(1), stored.ExpiresAt - stored.CreatedAt);
            stored.ExpiresAt = DateTimeOffset.UtcNow.AddSeconds(-1);
            await context.SaveChangesAsync();
        }

        await ProblemAssert.IsProblemAsync(await ResetAsync(token, NewPassword),
            HttpStatusCode.BadRequest, AccountService.InvalidLinkMessage);
        Assert.Equal(HttpStatusCode.BadRequest, (await CreateAnonymousClient().PostAsJsonAsync(
            "/api/auth/reset-password/check", new PasswordResetTokenDto { Token = token })).StatusCode);
    }

    // Unknown, deactivated and active addresses get the same answer. Only the
    // active account gets an email, and only one within the cooldown.
    [Fact]
    public async Task Requests_AnswerTheSameForEveryAddress_AndRespectTheCooldown()
    {
        await SeedUserAsync(confirmed: true);
        await SeedUserAsync(confirmed: true, email: "deactivated@integration.test", isActive: false);

        var responses = await Task.WhenAll(
            ForgotAsync(Email),
            ForgotAsync(Email),
            ForgotAsync(Email),
            ForgotAsync("nobody@integration.test"),
            ForgotAsync("deactivated@integration.test"));

        var bodies = await Task.WhenAll(responses.Select(response => response.Content.ReadAsStringAsync()));
        Assert.All(responses, response => Assert.Equal(HttpStatusCode.Accepted, response.StatusCode));
        Assert.Single(bodies.Distinct());
        await TestEmailSink.Instance.WaitForAsync(Email);
        await TestEmailSink.SettleAsync();
        Assert.Single(TestEmailSink.Instance.Messages);
    }

    // Someone registered this address with their own name and password. The
    // address's owner resets it: the account is set up again with the owner's
    // details, and nothing the registrant chose survives.
    [Fact]
    public async Task ResettingAnUnconfirmedAccount_SetsItUpAgainForTheInboxOwner()
    {
        await CreateAnonymousClient().PostAsJsonAsync("/api/auth/register", new RegisterUserDto
        {
            Name = "Squatter",
            Email = Email,
            Password = OldPassword
        });
        var squattersLink = TestEmailSink.TokenFrom((await TestEmailSink.Instance.WaitForAsync(Email))[0]);
        // The registrant also runs up failed attempts and asks for another link.
        await CreateAnonymousClient().PostAsJsonAsync("/api/auth/verify-email",
            new VerifyEmailDto { Token = squattersLink, Password = "Guess123456" });
        await CreateAnonymousClient().PostAsJsonAsync("/api/auth/resend-verification",
            new AccountEmailRequestDto { Email = Email });
        var before = await LoadUserAsync();
        Assert.Equal(1, before.FailedLoginCount);

        var token = await RequestLinkAsync(expectedEmails: 2);
        var resetEmail = TestEmailSink.Instance.Messages.Last(message => message.ToAddress == Email);
        var check = await CreateAnonymousClient().PostAsJsonAsync("/api/auth/reset-password/check",
            new PasswordResetTokenDto { Token = token });
        var withoutName = await ResetAsync(token, NewPassword);
        var reset = await ResetAsync(token, NewPassword, "Inbox Owner");

        Assert.Contains("sets the account up again", resetEmail.TextBody);
        Assert.True((await check.Content.ReadFromJsonAsync<PasswordResetTokenStatusDto>())!.CompletesRegistration);
        await ProblemAssert.IsProblemAsync(withoutName, HttpStatusCode.BadRequest, AccountService.NameRequiredMessage);
        Assert.Equal(HttpStatusCode.NoContent, reset.StatusCode);
        var after = await LoadUserAsync();
        // Every field the registrant set or caused is replaced.
        Assert.Equal("Inbox Owner", after.Name);
        Assert.NotEqual(before.PasswordHash, after.PasswordHash);
        Assert.True(after.IsEmailConfirmed);
        Assert.NotNull(after.EmailConfirmedAt);
        Assert.True(after.CreatedAt > before.CreatedAt);
        Assert.NotEqual(before.SecurityStamp, after.SecurityStamp);
        Assert.Equal((0, null), (after.FailedLoginCount, after.LockoutEndsAt));
        Assert.Equal((UserRoles.User, true), (after.Role, after.IsActive));
        await using (var context = Fixture.CreateDbContext())
        {
            Assert.All(await context.UserTokens.Where(token => token.UserId == after.Id).ToListAsync(),
                token => Assert.NotNull(token.UsedAt));
            Assert.Empty(await context.AccountEmailCooldowns.Where(cooldown => cooldown.UserId == after.Id).ToListAsync());
            Assert.Empty(await context.Reservations.Where(reservation => reservation.UserId == after.Id).ToListAsync());
            Assert.Empty(await context.BookingNotifications.Where(n => n.RecipientEmail == Email).ToListAsync());
        }
        Assert.Equal(HttpStatusCode.Unauthorized, (await SignInResponseAsync(OldPassword)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await SignInResponseAsync(NewPassword)).StatusCode);
        // The registrant's verification link was cancelled with the reset.
        Assert.Equal(HttpStatusCode.BadRequest, (await CreateAnonymousClient().PostAsJsonAsync(
            "/api/auth/verify-email", new VerifyEmailDto { Token = squattersLink, Password = OldPassword })).StatusCode);
    }

    [Fact]
    public async Task ALinkStopsWorking_WhenTheAccountIsDeactivated()
    {
        var user = await SeedUserAsync(confirmed: true);
        var token = await RequestLinkAsync();
        await using (var context = Fixture.CreateDbContext())
        {
            await context.Users.Where(stored => stored.Id == user.Id)
                .ExecuteUpdateAsync(setters => setters.SetProperty(stored => stored.IsActive, false));
        }

        await ProblemAssert.IsProblemAsync(await ResetAsync(token, NewPassword),
            HttpStatusCode.BadRequest, AccountService.InvalidLinkMessage);
    }

    private async Task<string> RequestLinkAsync(int expectedEmails = 1)
    {
        Assert.Equal(HttpStatusCode.Accepted, (await ForgotAsync(Email)).StatusCode);
        var emails = await TestEmailSink.Instance.WaitForAsync(Email, count: expectedEmails);
        var email = emails[expectedEmails - 1];
        Assert.Equal("Reset your password", email.Subject);
        Assert.Contains("https://app.integration.test/reset-password#token=", email.TextBody);

        return TestEmailSink.TokenFrom(email);
    }

    private Task<HttpResponseMessage> ForgotAsync(string email)
    {
        return CreateAnonymousClient().PostAsJsonAsync("/api/auth/forgot-password",
            new AccountEmailRequestDto { Email = email });
    }

    private Task<HttpResponseMessage> ResetAsync(string token, string password, string? name = null)
    {
        return CreateAnonymousClient().PostAsJsonAsync("/api/auth/reset-password", new ResetPasswordDto
        {
            Token = token,
            Password = password,
            Name = name
        });
    }

    private Task<HttpResponseMessage> SignInResponseAsync(string password)
    {
        return CreateAnonymousClient().PostAsJsonAsync("/api/auth/login", new LoginUserDto
        {
            Email = Email,
            Password = password
        });
    }

    private async Task<HttpClient> SignInAsync(string password)
    {
        var response = await CreateAnonymousClient().PostAsJsonAsync("/api/auth/token", new LoginUserDto
        {
            Email = Email,
            Password = password
        });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var client = CreateAnonymousClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer",
            (await response.Content.ReadFromJsonAsync<AuthResponseDto>())!.Token);

        return client;
    }

    private async Task<User> SeedUserAsync(bool confirmed, string email = Email, bool isActive = true)
    {
        await using var context = Fixture.CreateDbContext();
        var user = new User
        {
            Name = "Reset User",
            Email = email,
            IsEmailConfirmed = confirmed,
            IsActive = isActive,
            CreatedAt = DateTimeOffset.UtcNow.AddDays(-1)
        };
        user.PasswordHash = new PasswordHasher<User>().HashPassword(user, OldPassword);
        context.Users.Add(user);
        await context.SaveChangesAsync();

        return user;
    }

    private async Task<User> LoadUserAsync()
    {
        await using var context = Fixture.CreateDbContext();

        return await context.Users.AsNoTracking().SingleAsync(user => user.Email == Email);
    }
}
