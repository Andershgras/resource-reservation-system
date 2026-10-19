using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.Tokens;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.IntegrationTests.Infrastructure;
using ResourceReservation.Api.Models;
using ResourceReservation.Api.Services;

namespace ResourceReservation.Api.IntegrationTests;

// The per-request token check fails closed, and the security stamp and its
// fingerprint never reach logs or error responses (ADR 0010).
public class TokenValidationTests : ApiTestBase
{
    public TokenValidationTests(ApiFixture fixture)
        : base(fixture)
    {
    }

    // If the check itself fails, such as when the database can't be reached,
    // the request is refused rather than let through on the signature alone.
    [Fact]
    public async Task AFailingCheck_RefusesTheRequest()
    {
        var token = (await CreateAdminClientAsync()).DefaultRequestHeaders.Authorization!;
        await using var factory = Fixture.Factory.WithWebHostBuilder(builder =>
            builder.ConfigureTestServices(services => services.AddScoped<UserSessionValidator>(
                _ => throw new InvalidOperationException("Simulated database failure"))));
        var client = factory.CreateBrowserClient();
        client.DefaultRequestHeaders.Authorization = token;

        var adminOnly = await client.GetAsync("/api/users");
        var ownData = await client.GetAsync("/api/reservations/me");

        foreach (var response in new[] { adminOnly, ownData })
        {
            await ProblemAssert.IsProblemAsync(response, HttpStatusCode.InternalServerError);
            Assert.DoesNotContain("Simulated", await response.Content.ReadAsStringAsync());
        }
    }

    [Fact]
    public async Task ATokenForAUserWhoNoLongerExists_IsRejected()
    {
        var client = CreateAnonymousClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer",
            CreateToken(userId: 999999, UserSessionValidator.FingerprintSecurityStamp(User.NewSecurityStamp())));

        await ProblemAssert.IsProblemAsync(
            await client.GetAsync("/api/reservations/me"),
            HttpStatusCode.Unauthorized,
            "Authentication is required.");
    }

    // Logs everything, at every level, through sign-in, use, revocation and a
    // rejected token, and checks no stamp or fingerprint is written.
    [Fact]
    public async Task TheStampAndItsFingerprint_NeverAppearInLogsOrErrorResponses()
    {
        var logs = new CapturingLoggerProvider();
        await using var factory = Fixture.Factory.WithWebHostBuilder(builder =>
            builder.ConfigureLogging(logging => logging.SetMinimumLevel(LogLevel.Trace).AddProvider(logs)));
        var adminClient = factory.CreateBrowserClient();
        adminClient.DefaultRequestHeaders.Authorization = await SignInAsync(factory, ApiFixture.AdminEmail, ApiFixture.AdminPassword);
        await adminClient.PostAsJsonAsync("/api/auth/register", new RegisterUserDto
        {
            Name = "Logged User",
            Email = "logged@integration.test",
            Password = "UserPassword123"
        });
        await ConfirmEmailAsync("logged@integration.test");
        var userClient = factory.CreateBrowserClient();
        userClient.DefaultRequestHeaders.Authorization = await SignInAsync(factory, "logged@integration.test", "UserPassword123");
        var user = await LoadUserAsync("logged@integration.test");
        var oldStamp = user.SecurityStamp;

        Assert.Equal(HttpStatusCode.OK, (await userClient.GetAsync("/api/reservations/me")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await adminClient.PutAsJsonAsync(
            $"/api/users/{user.Id}/status",
            new ChangeUserStatusDto { IsActive = false })).StatusCode);
        var rejected = await userClient.GetAsync("/api/reservations/me");
        var deactivatedSignIn = await factory.CreateBrowserClient().PostAsJsonAsync("/api/auth/login", new LoginUserDto
        {
            Email = "logged@integration.test",
            Password = "UserPassword123"
        });

        var newStamp = (await LoadUserAsync("logged@integration.test")).SecurityStamp;
        var secrets = new[]
        {
            oldStamp,
            newStamp,
            UserSessionValidator.FingerprintSecurityStamp(oldStamp),
            UserSessionValidator.FingerprintSecurityStamp(newStamp)
        };
        Assert.Equal(HttpStatusCode.Unauthorized, rejected.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, deactivatedSignIn.StatusCode);
        var errorBodies = await rejected.Content.ReadAsStringAsync() + await deactivatedSignIn.Content.ReadAsStringAsync();
        Assert.NotEmpty(logs.Messages);

        foreach (var secret in secrets)
        {
            Assert.DoesNotContain(secret, errorBodies, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain(logs.Messages, message => message.Contains(secret, StringComparison.OrdinalIgnoreCase));
        }
    }

    private static async Task<AuthenticationHeaderValue> SignInAsync(
        Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactory<Program> factory,
        string email,
        string password)
    {
        var response = await factory.CreateBrowserClient().PostAsJsonAsync("/api/auth/token", new LoginUserDto
        {
            Email = email,
            Password = password
        });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var auth = await response.Content.ReadFromJsonAsync<AuthResponseDto>();

        return new AuthenticationHeaderValue("Bearer", auth!.Token);
    }

    private async Task<User> LoadUserAsync(string email)
    {
        await using var context = Fixture.CreateDbContext();

        return await context.Users.AsNoTracking().SingleAsync(user => user.Email == email);
    }

    // Signed with the test host's key, so only the claims decide whether it is accepted.
    private static string CreateToken(int userId, string stampFingerprint)
    {
        var token = new JwtSecurityToken(
            issuer: ApiFactory.JwtIssuerAndAudience,
            audience: ApiFactory.JwtIssuerAndAudience,
            claims:
            [
                new Claim(ClaimTypes.NameIdentifier, userId.ToString()),
                new Claim(ClaimTypes.Role, UserRoles.User),
                new Claim(UserSessionValidator.SecurityStampClaimType, stampFingerprint)
            ],
            expires: DateTime.UtcNow.AddMinutes(10),
            signingCredentials: new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(ApiFactory.JwtKey)),
                SecurityAlgorithms.HmacSha256));

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
