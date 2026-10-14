using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.IntegrationTests.Infrastructure;
using ResourceReservation.Api.Models;
using ResourceReservation.Api.Services;

namespace ResourceReservation.Api.IntegrationTests;

// Confirming an address with its link and the account's password (ADR 0011).
public class EmailVerificationTests : ApiTestBase
{
    private const string Email = "verify@integration.test";
    private const string Password = "Password123";

    public EmailVerificationTests(ApiFixture fixture)
        : base(fixture)
    {
    }

    [Fact]
    public async Task TheLinkAndThePassword_ConfirmTheAccount_OnlyOnce()
    {
        var token = await RegisterAndGetLinkAsync();

        var confirm = await VerifyAsync(token, Password);

        Assert.Equal(HttpStatusCode.NoContent, confirm.StatusCode);
        var user = await LoadUserAsync();
        Assert.True(user.IsEmailConfirmed);
        Assert.NotNull(user.EmailConfirmedAt);
        Assert.Equal(HttpStatusCode.OK, (await SignInAsync()).StatusCode);
        await ProblemAssert.IsProblemAsync(
            await VerifyAsync(token, Password),
            HttpStatusCode.BadRequest,
            AccountService.InvalidLinkMessage);
    }

    // A link sent to someone who didn't register can't activate the account.
    [Fact]
    public async Task AWrongPassword_DoesNotConfirm_AndLeavesTheLinkUsable()
    {
        var token = await RegisterAndGetLinkAsync();

        await ProblemAssert.IsProblemAsync(
            await VerifyAsync(token, "NotTheOwnersPassword1"),
            HttpStatusCode.BadRequest,
            AccountService.WrongPasswordMessage);

        var user = await LoadUserAsync();
        Assert.False(user.IsEmailConfirmed);
        Assert.Equal(1, user.FailedLoginCount);
        Assert.Equal(HttpStatusCode.NoContent, (await VerifyAsync(token, Password)).StatusCode);
    }

    [Fact]
    public async Task ALockedAccount_CannotBeConfirmedUntilTheLockoutEnds()
    {
        var token = await RegisterAndGetLinkAsync();

        for (var attempt = 0; attempt < 5; attempt++)
        {
            await VerifyAsync(token, "NotTheOwnersPassword1");
        }

        await ProblemAssert.IsProblemAsync(
            await VerifyAsync(token, Password),
            HttpStatusCode.BadRequest,
            AccountService.TooManyAttemptsMessage);
        Assert.False((await LoadUserAsync()).IsEmailConfirmed);
    }

    [Fact]
    public async Task OneLinkUsedTenTimesAtOnce_ConfirmsOnce()
    {
        var token = await RegisterAndGetLinkAsync();
        var client = CreateAnonymousClient();

        var responses = await Task.WhenAll(Enumerable.Range(0, 10)
            .Select(_ => client.PostAsJsonAsync("/api/auth/verify-email", new VerifyEmailDto
            {
                Token = token,
                Password = Password
            })));

        Assert.Equal(1, responses.Count(response => response.StatusCode == HttpStatusCode.NoContent));
        Assert.Equal(9, responses.Count(response => response.StatusCode == HttpStatusCode.BadRequest));
        await using var context = Fixture.CreateDbContext();
        Assert.NotNull((await context.UserTokens.SingleAsync()).UsedAt);
    }

    [Fact]
    public async Task AnExpiredLink_DoesNotWork()
    {
        var token = await RegisterAndGetLinkAsync();
        await using (var context = Fixture.CreateDbContext())
        {
            await context.UserTokens.ExecuteUpdateAsync(setters =>
                setters.SetProperty(stored => stored.ExpiresAt, DateTimeOffset.UtcNow.AddSeconds(-1)));
        }

        await ProblemAssert.IsProblemAsync(
            await VerifyAsync(token, Password),
            HttpStatusCode.BadRequest,
            AccountService.InvalidLinkMessage);
    }

    [Theory]
    [InlineData("")]
    [InlineData("not-a-token")]
    [InlineData("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")]
    public async Task AMadeUpLink_DoesNotWork(string token)
    {
        await RegisterAndGetLinkAsync();

        var response = await VerifyAsync(token, Password);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.False((await LoadUserAsync()).IsEmailConfirmed);
    }

    [Fact]
    public async Task ANewLink_ReplacesTheOldOne_AfterTheCooldown()
    {
        var oldToken = await RegisterAndGetLinkAsync();
        await EndCooldownsAsync();

        var resend = await ResendAsync(Email);
        var emails = await TestEmailSink.Instance.WaitForAsync(Email, count: 2);
        var newToken = TestEmailSink.TokenFrom(emails[1]);

        Assert.Equal(HttpStatusCode.Accepted, resend.StatusCode);
        Assert.NotEqual(oldToken, newToken);
        Assert.Equal(HttpStatusCode.BadRequest, (await VerifyAsync(oldToken, Password)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await VerifyAsync(newToken, Password)).StatusCode);
    }

    [Fact]
    public async Task Resending_WithinTheCooldown_SendsNothing_EvenInParallel()
    {
        await RegisterAndGetLinkAsync();
        await EndCooldownsAsync();

        var responses = await Task.WhenAll(Enumerable.Range(0, 10).Select(_ => ResendAsync(Email)));

        Assert.All(responses, response => Assert.Equal(HttpStatusCode.Accepted, response.StatusCode));
        await TestEmailSink.Instance.WaitForAsync(Email, count: 2);
        await TestEmailSink.SettleAsync();
        Assert.Equal(2, TestEmailSink.Instance.Messages.Count(message => message.ToAddress == Email));
    }

    // Unknown, confirmed and unconfirmed addresses get the same answer, and
    // only the unconfirmed one gets an email.
    [Fact]
    public async Task Resending_AnswersTheSameForEveryAddress()
    {
        await RegisterAndGetLinkAsync();
        await EndCooldownsAsync();

        var responses = new[]
        {
            await ResendAsync(Email),
            await ResendAsync("nobody@integration.test"),
            await ResendAsync(ApiFixture.AdminEmail)
        };

        var bodies = await Task.WhenAll(responses.Select(response => response.Content.ReadAsStringAsync()));
        Assert.All(responses, response => Assert.Equal(HttpStatusCode.Accepted, response.StatusCode));
        Assert.Single(bodies.Distinct());
        await TestEmailSink.SettleAsync();
        Assert.Equal(2, TestEmailSink.Instance.Messages.Count(message => message.ToAddress == Email));
        Assert.DoesNotContain(TestEmailSink.Instance.Messages, message => message.ToAddress != Email);
    }

    // Even a correctly signed token is refused for an unconfirmed account, so
    // it can't book anything.
    [Fact]
    public async Task AnUnconfirmedAccount_CannotUseAToken()
    {
        await RegisterAndGetLinkAsync();
        var user = await LoadUserAsync();
        var client = CreateAnonymousClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", CreateToken(user));

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/reservations/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/reservations", new CreateReservationDto
        {
            ResourceId = 1,
            StartTime = BookingDay.AddHours(9),
            EndTime = BookingDay.AddHours(10)
        })).StatusCode);
    }

    private async Task<string> RegisterAndGetLinkAsync()
    {
        var response = await CreateAnonymousClient().PostAsJsonAsync("/api/auth/register", new RegisterUserDto
        {
            Name = "Verifying User",
            Email = Email,
            Password = Password
        });
        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);

        return TestEmailSink.TokenFrom((await TestEmailSink.Instance.WaitForAsync(Email))[0]);
    }

    private Task<HttpResponseMessage> VerifyAsync(string token, string password)
    {
        return CreateAnonymousClient().PostAsJsonAsync("/api/auth/verify-email", new VerifyEmailDto
        {
            Token = token,
            Password = password
        });
    }

    private Task<HttpResponseMessage> ResendAsync(string email)
    {
        return CreateAnonymousClient().PostAsJsonAsync("/api/auth/resend-verification", new AccountEmailRequestDto
        {
            Email = email
        });
    }

    private Task<HttpResponseMessage> SignInAsync()
    {
        return CreateAnonymousClient().PostAsJsonAsync("/api/auth/login", new LoginUserDto
        {
            Email = Email,
            Password = Password
        });
    }

    private async Task EndCooldownsAsync()
    {
        await using var context = Fixture.CreateDbContext();
        await context.AccountEmailCooldowns.ExecuteUpdateAsync(setters =>
            setters.SetProperty(cooldown => cooldown.LastSentAt, DateTimeOffset.UtcNow.AddHours(-1)));
    }

    private async Task<User> LoadUserAsync()
    {
        await using var context = Fixture.CreateDbContext();

        return await context.Users.AsNoTracking().SingleAsync(user => user.Email == Email);
    }

    // Signed with the test host's key, with the user's real stamp.
    private static string CreateToken(User user)
    {
        var token = new JwtSecurityToken(
            issuer: ApiFactory.JwtIssuerAndAudience,
            audience: ApiFactory.JwtIssuerAndAudience,
            claims:
            [
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new Claim(ClaimTypes.Role, user.Role),
                new Claim(UserSessionValidator.SecurityStampClaimType,
                    UserSessionValidator.FingerprintSecurityStamp(user.SecurityStamp))
            ],
            expires: DateTime.UtcNow.AddMinutes(10),
            signingCredentials: new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(ApiFactory.JwtKey)),
                SecurityAlgorithms.HmacSha256));

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
