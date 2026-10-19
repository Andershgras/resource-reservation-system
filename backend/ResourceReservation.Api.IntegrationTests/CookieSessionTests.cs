using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using ResourceReservation.Api.Configuration;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.IntegrationTests.Infrastructure;
using ResourceReservation.Api.Models;
using ResourceReservation.Api.Services;

namespace ResourceReservation.Api.IntegrationTests;

// Browser sessions in an httpOnly cookie, server-side sign-out and CSRF
// protection (ADR 0012).
public class CookieSessionTests : ApiTestBase
{
    // Frontend:BaseUrl in the test host.
    private const string FrontendOrigin = "https://app.integration.test";

    public CookieSessionTests(ApiFixture fixture)
        : base(fixture)
    {
    }

    [Fact]
    public async Task Login_SetsAStrictHostOnlyCookie_AndReturnsNoToken()
    {
        var response = await LoginAsync(CreateAnonymousClient());

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var cookie = Assert.Single(SetCookieHeaders(response), header =>
            header.StartsWith(AuthCookieOptions.SessionCookieName + "=", StringComparison.Ordinal));
        var attributes = cookie.ToLowerInvariant();
        Assert.Contains("; secure", attributes);
        Assert.Contains("; httponly", attributes);
        Assert.Contains("; samesite=strict", attributes);
        Assert.Contains("; path=/", attributes);
        Assert.Contains("; expires=", attributes);
        Assert.DoesNotContain("; domain=", attributes);

        var json = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("token", json, StringComparison.OrdinalIgnoreCase);
        var session = await response.Content.ReadFromJsonAsync<SessionResponseDto>();
        Assert.Equal(ApiFixture.AdminEmail, session!.User.Email);
        Assert.InRange(session.ExpiresInSeconds, 120 * 60 - 5, 120 * 60);
    }

    [Fact]
    public async Task TheAntiforgeryCookie_IsStrictAndHostOnly()
    {
        var response = await CreateAnonymousClient().GetAsync("/api/auth/csrf");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var cookie = Assert.Single(SetCookieHeaders(response), header =>
            header.StartsWith(AuthCookieOptions.AntiforgeryCookieName + "=", StringComparison.Ordinal));
        var attributes = cookie.ToLowerInvariant();
        Assert.Contains("; secure", attributes);
        Assert.Contains("; httponly", attributes);
        Assert.Contains("; samesite=strict", attributes);
        Assert.Contains("; path=/", attributes);
        Assert.DoesNotContain("; domain=", attributes);
        Assert.Equal("no-store", response.Headers.CacheControl?.ToString());
    }

    [Fact]
    public async Task TheCookie_AuthenticatesRequests_AndMeRestoresTheSession()
    {
        var client = await CreateBrowserSessionClientAsync(ApiFixture.AdminEmail, ApiFixture.AdminPassword);

        var me = await client.GetAsync("/api/auth/me");
        var users = await client.GetAsync("/api/users");

        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
        var session = await me.Content.ReadFromJsonAsync<SessionResponseDto>();
        Assert.Equal(ApiFixture.AdminEmail, session!.User.Email);
        Assert.Equal(UserRoles.Admin, session.User.Role);
        Assert.InRange(session.ExpiresInSeconds, 120 * 60 - 5, 120 * 60);
        Assert.Equal(HttpStatusCode.OK, users.StatusCode);
    }

    [Fact]
    public async Task Me_WithoutASession_Returns401()
    {
        var response = await CreateAnonymousClient().GetAsync("/api/auth/me");

        await ProblemAssert.IsProblemAsync(response, HttpStatusCode.Unauthorized, "Authentication is required.");
    }

    [Fact]
    public async Task Logout_RevokesOnlyThatSession_EvenIfItsCookieIsReplayed()
    {
        var laptop = CreateAnonymousClient();
        var stolenCookie = SessionCookieValue(await LoginAsync(laptop));
        var phone = await CreateBrowserSessionClientAsync(ApiFixture.AdminEmail, ApiFixture.AdminPassword);

        var logout = await laptop.PostAsync("/api/auth/logout", null);

        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);
        // The browser deletes the cookie...
        Assert.Contains(SetCookieHeaders(logout), header =>
            header.StartsWith(AuthCookieOptions.SessionCookieName + "=;", StringComparison.Ordinal) &&
            header.Contains("secure", StringComparison.OrdinalIgnoreCase));
        Assert.Equal(HttpStatusCode.Unauthorized, (await laptop.GetAsync("/api/auth/me")).StatusCode);
        // ...and a copy of it no longer works, because the session is revoked on the server.
        Assert.Equal(HttpStatusCode.Unauthorized, (await GetMeWithCookieAsync(stolenCookie)).StatusCode);
        // The same user's other session keeps working.
        Assert.Equal(HttpStatusCode.OK, (await phone.GetAsync("/api/auth/me")).StatusCode);
        await using var context = Fixture.CreateDbContext();
        Assert.Equal(1, await context.UserSessions.CountAsync(session => session.RevokedAt != null));
    }

    [Fact]
    public async Task Logout_WithABearerToken_RevokesThatToken()
    {
        var client = await CreateAdminClientAsync();

        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsync("/api/auth/logout", null)).StatusCode);

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Logout_WithoutASession_StillClearsTheCookie()
    {
        var response = await CreateAnonymousClient().PostAsync("/api/auth/logout", null);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Contains(SetCookieHeaders(response), header =>
            header.StartsWith(AuthCookieOptions.SessionCookieName + "=;", StringComparison.Ordinal));
    }

    [Fact]
    public async Task SigningInAgain_RevokesTheBrowsersPreviousSession()
    {
        var client = CreateAnonymousClient();
        var firstCookie = SessionCookieValue(await LoginAsync(client));

        await LoginAsync(client);

        Assert.Equal(HttpStatusCode.Unauthorized, (await GetMeWithCookieAsync(firstCookie)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/auth/me")).StatusCode);
    }

    // Fails closed: anything other than a current session of the token's own user is refused.
    [Fact]
    public async Task ATokenWhoseSessionIsRevokedExpiredMissingOrSomeoneElses_IsRejected()
    {
        var admin = await LoadUserAsync(ApiFixture.AdminEmail);
        await CreateUserClientAsync();
        var otherUser = await LoadUserAsync("user@integration.test");
        var revoked = await CreateSessionAsync(admin.Id);
        var expired = await CreateSessionAsync(admin.Id);
        var otherUsersSession = await CreateSessionAsync(otherUser.Id);
        var current = await CreateSessionAsync(admin.Id);
        await using (var context = Fixture.CreateDbContext())
        {
            await context.UserSessions.Where(session => session.Id == revoked)
                .ExecuteUpdateAsync(setters => setters.SetProperty(session => session.RevokedAt, DateTimeOffset.UtcNow));
            await context.UserSessions.Where(session => session.Id == expired)
                .ExecuteUpdateAsync(setters => setters.SetProperty(session => session.ExpiresAt, DateTimeOffset.UtcNow.AddMinutes(-1)));
        }

        var statuses = new[]
        {
            await GetMeWithTokenAsync(CreateToken(admin, revoked)),
            await GetMeWithTokenAsync(CreateToken(admin, expired)),
            await GetMeWithTokenAsync(CreateToken(admin, Guid.NewGuid())),
            await GetMeWithTokenAsync(CreateToken(admin, otherUsersSession)),
            await GetMeWithTokenAsync(CreateToken(admin, sessionId: null)),
            await GetMeWithTokenAsync(CreateToken(admin, current))
        };

        Assert.Equal(
            [
                HttpStatusCode.Unauthorized, HttpStatusCode.Unauthorized, HttpStatusCode.Unauthorized,
                HttpStatusCode.Unauthorized, HttpStatusCode.Unauthorized, HttpStatusCode.OK
            ],
            statuses);
    }

    [Fact]
    public async Task AStampChange_StillEndsCookieSessions()
    {
        var adminClient = await CreateAdminClientAsync();
        await CreateUserClientAsync();
        var user = await LoadUserAsync("user@integration.test");
        var userBrowser = await CreateBrowserSessionClientAsync("user@integration.test", "UserPassword123");

        var deactivate = await adminClient.PutAsJsonAsync(
            $"/api/users/{user.Id}/status",
            new ChangeUserStatusDto { IsActive = false });

        Assert.Equal(HttpStatusCode.OK, deactivate.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await userBrowser.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task ACookieRequestWithoutAnAntiforgeryToken_IsRejected()
    {
        var client = await CreateBrowserSessionClientAsync(ApiFixture.AdminEmail, ApiFixture.AdminPassword);
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/resources")
        {
            Content = JsonContent.Create(new CreateResourceDto { Name = "Forged" })
        };
        // Already has the header, so the test client adds no token.
        request.Headers.Add(AuthCookieOptions.AntiforgeryHeaderName, "not-a-token");

        var response = await client.SendAsync(request);

        await AssertRejectedAsync(response, CsrfProtection.InvalidTokenCode);
        await using var context = Fixture.CreateDbContext();
        Assert.False(await context.Resources.AnyAsync());
    }

    // The token is bound to the user, so one fetched before signing in is refused after.
    [Fact]
    public async Task AnAntiforgeryTokenFromBeforeSigningIn_IsRejectedAfterwards()
    {
        var client = Fixture.Factory.CreateBrowserClientWithoutCsrfTokens();
        var anonymousToken = await GetCsrfTokenAsync(client);
        var login = await PostWithTokenAsync(client, "/api/auth/login", anonymousToken, AdminLogin());
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);

        var withOldToken = await PostWithTokenAsync(client, "/api/resources", anonymousToken, new CreateResourceDto { Name = "Old token" });
        var withNewToken = await PostWithTokenAsync(client, "/api/resources", await GetCsrfTokenAsync(client), new CreateResourceDto { Name = "New token" });

        await AssertRejectedAsync(withOldToken, CsrfProtection.InvalidTokenCode);
        Assert.Equal(HttpStatusCode.Created, withNewToken.StatusCode);
    }

    // Login CSRF: another site can't sign a visitor into the attacker's account.
    [Fact]
    public async Task Login_WithoutAnAntiforgeryToken_IsRejected()
    {
        var client = Fixture.Factory.CreateBrowserClientWithoutCsrfTokens();

        var response = await client.PostAsJsonAsync("/api/auth/login", AdminLogin());

        await AssertRejectedAsync(response, CsrfProtection.InvalidTokenCode);
        Assert.DoesNotContain(SetCookieHeaders(response), header =>
            header.StartsWith(AuthCookieOptions.SessionCookieName + "=", StringComparison.Ordinal));
    }

    [Theory]
    [InlineData("cross-site", null)]
    [InlineData("same-site", null)]
    [InlineData(null, "https://evil.example")]
    [InlineData("same-origin", "https://evil.example")]
    [InlineData(null, "null")]
    public async Task ARequestFromAnotherSiteOrOrigin_IsRejectedEvenWithAValidToken(string? fetchSite, string? origin)
    {
        var client = await CreateBrowserSessionClientAsync(ApiFixture.AdminEmail, ApiFixture.AdminPassword);
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/resources")
        {
            Content = JsonContent.Create(new CreateResourceDto { Name = "Cross-site" })
        };
        request.Headers.Add(AuthCookieOptions.AntiforgeryHeaderName, await GetCsrfTokenAsync(client));
        AddBrowserHeaders(request, fetchSite, origin);

        var response = await client.SendAsync(request);

        await AssertRejectedAsync(response, CsrfProtection.CrossSiteCode);
    }

    // The frontend's origin, or the API's own, such as Swagger UI in Development.
    [Theory]
    [InlineData(FrontendOrigin)]
    [InlineData("https://localhost")]
    public async Task ASameOriginRequest_IsAccepted(string origin)
    {
        var client = await CreateBrowserSessionClientAsync(ApiFixture.AdminEmail, ApiFixture.AdminPassword);
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/resources")
        {
            Content = JsonContent.Create(new CreateResourceDto { Name = "Same origin" })
        };
        request.Headers.Add(AuthCookieOptions.AntiforgeryHeaderName, await GetCsrfTokenAsync(client));
        AddBrowserHeaders(request, "same-origin", origin);

        Assert.Equal(HttpStatusCode.Created, (await client.SendAsync(request)).StatusCode);
    }

    // Only a bearer token that passed every check skips CSRF protection, even
    // from another site.
    [Fact]
    public async Task AValidatedBearerToken_NeedsNoAntiforgeryToken()
    {
        var client = await CreateAdminClientAsync();
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/resources")
        {
            Content = JsonContent.Create(new CreateResourceDto { Name = "Bearer" })
        };
        AddBrowserHeaders(request, "cross-site", "https://other-app.example");

        Assert.Equal(HttpStatusCode.Created, (await client.SendAsync(request)).StatusCode);
    }

    [Theory]
    [InlineData("not-a-jwt")]
    [InlineData("revoked")]
    public async Task ABearerHeaderThatFailsValidation_DoesNotSkipCsrfProtection(string kind)
    {
        var token = "not-a-jwt";

        if (kind == "revoked")
        {
            var admin = await LoadUserAsync(ApiFixture.AdminEmail);
            var sessionId = await CreateSessionAsync(admin.Id);
            await using var context = Fixture.CreateDbContext();
            await context.UserSessions.Where(session => session.Id == sessionId)
                .ExecuteUpdateAsync(setters => setters.SetProperty(session => session.RevokedAt, DateTimeOffset.UtcNow));
            token = CreateToken(admin, sessionId);
        }

        // An anonymous endpoint, so authorization doesn't reject it first.
        var client = Fixture.Factory.CreateBrowserClientWithoutCsrfTokens();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var response = await client.PostAsJsonAsync("/api/auth/login", AdminLogin());

        await AssertRejectedAsync(response, CsrfProtection.InvalidTokenCode);
    }

    [Fact]
    public async Task Token_NeedsNoAntiforgeryTokenAndSetsNoCookie()
    {
        var client = Fixture.Factory.CreateBrowserClientWithoutCsrfTokens();

        var response = await client.PostAsJsonAsync("/api/auth/token", AdminLogin());

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Empty(SetCookieHeaders(response));
        var auth = await response.Content.ReadFromJsonAsync<AuthResponseDto>();
        Assert.False(string.IsNullOrEmpty(auth!.Token));
        await using var context = Fixture.CreateDbContext();
        Assert.Equal(UserSessionClients.Token, (await context.UserSessions.SingleAsync()).Client);
    }

    [Fact]
    public async Task Token_FromAnotherSite_IsRejected()
    {
        var client = Fixture.Factory.CreateBrowserClientWithoutCsrfTokens();
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/auth/token")
        {
            Content = JsonContent.Create(AdminLogin())
        };
        AddBrowserHeaders(request, "cross-site", "https://evil.example");

        await AssertRejectedAsync(await client.SendAsync(request), CsrfProtection.CrossSiteCode);
    }

    private static LoginUserDto AdminLogin()
    {
        return new LoginUserDto { Email = ApiFixture.AdminEmail, Password = ApiFixture.AdminPassword };
    }

    private static Task<HttpResponseMessage> LoginAsync(HttpClient client)
    {
        return client.PostAsJsonAsync("/api/auth/login", AdminLogin());
    }

    private static async Task<string> GetCsrfTokenAsync(HttpClient client)
    {
        var response = await client.GetAsync("/api/auth/csrf");
        response.EnsureSuccessStatusCode();

        return (await response.Content.ReadFromJsonAsync<CsrfTokenDto>())!.Token;
    }

    private static Task<HttpResponseMessage> PostWithTokenAsync<T>(HttpClient client, string path, string csrfToken, T body)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = JsonContent.Create(body) };
        request.Headers.Add(AuthCookieOptions.AntiforgeryHeaderName, csrfToken);

        return client.SendAsync(request);
    }

    private static void AddBrowserHeaders(HttpRequestMessage request, string? fetchSite, string? origin)
    {
        if (fetchSite is not null)
        {
            request.Headers.Add("Sec-Fetch-Site", fetchSite);
        }

        if (origin is not null)
        {
            request.Headers.Add("Origin", origin);
        }
    }

    private static async Task AssertRejectedAsync(HttpResponseMessage response, string code)
    {
        var problem = await ProblemAssert.IsProblemAsync(response, HttpStatusCode.Forbidden);
        Assert.Equal(code, problem.Extensions["code"]?.ToString());
    }

    private static IEnumerable<string> SetCookieHeaders(HttpResponseMessage response)
    {
        return response.Headers.TryGetValues("Set-Cookie", out var values) ? values : [];
    }

    private static string SessionCookieValue(HttpResponseMessage loginResponse)
    {
        var header = SetCookieHeaders(loginResponse)
            .Single(value => value.StartsWith(AuthCookieOptions.SessionCookieName + "=", StringComparison.Ordinal));

        return header[(AuthCookieOptions.SessionCookieName.Length + 1)..header.IndexOf(';')];
    }

    // A client with no cookie jar, sending exactly the given cookie.
    private Task<HttpResponseMessage> GetMeWithCookieAsync(string cookieValue)
    {
        var client = Fixture.Factory.CreateDefaultClient(Fixture.Factory.ClientOptions.BaseAddress);
        var request = new HttpRequestMessage(HttpMethod.Get, "/api/auth/me");
        request.Headers.Add("Cookie", $"{AuthCookieOptions.SessionCookieName}={cookieValue}");

        return client.SendAsync(request);
    }

    private async Task<HttpStatusCode> GetMeWithTokenAsync(string token)
    {
        var client = Fixture.Factory.CreateDefaultClient(Fixture.Factory.ClientOptions.BaseAddress);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        return (await client.GetAsync("/api/auth/me")).StatusCode;
    }

    private async Task<User> LoadUserAsync(string email)
    {
        await using var context = Fixture.CreateDbContext();

        return await context.Users.AsNoTracking().SingleAsync(user => user.Email == email);
    }

    // Signed with the test host's key and the user's real stamp, so only the
    // session decides whether it is accepted.
    private static string CreateToken(User user, Guid? sessionId)
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Role, user.Role),
            new(UserSessionValidator.SecurityStampClaimType, UserSessionValidator.FingerprintSecurityStamp(user.SecurityStamp))
        };

        if (sessionId is not null)
        {
            claims.Add(new Claim(UserSessionValidator.SessionIdClaimType, sessionId.Value.ToString()));
        }

        var token = new JwtSecurityToken(
            issuer: ApiFactory.JwtIssuerAndAudience,
            audience: ApiFactory.JwtIssuerAndAudience,
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(10),
            signingCredentials: new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(ApiFactory.JwtKey)),
                SecurityAlgorithms.HmacSha256));

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
