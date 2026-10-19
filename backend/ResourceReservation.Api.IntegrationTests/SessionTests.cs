using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.IntegrationTests.Infrastructure;

namespace ResourceReservation.Api.IntegrationTests;

public class SessionTests : ApiTestBase
{
    public SessionTests(ApiFixture fixture)
        : base(fixture)
    {
    }

    [Fact]
    public async Task Token_ReturnsWhenTheTokenExpires()
    {
        var before = DateTimeOffset.UtcNow;

        var response = await CreateAnonymousClient().PostAsJsonAsync("/api/auth/token", new LoginUserDto
        {
            Email = ApiFixture.AdminEmail,
            Password = ApiFixture.AdminPassword
        });

        response.EnsureSuccessStatusCode();
        var auth = await response.Content.ReadFromJsonAsync<AuthResponseDto>();
        var token = new JwtSecurityTokenHandler().ReadJwtToken(auth!.Token);
        // The default lifetime is 120 minutes.
        Assert.Equal(120 * 60, auth.ExpiresInSeconds);
        Assert.InRange(auth.ExpiresAt, before.AddMinutes(120), DateTimeOffset.UtcNow.AddMinutes(120));
        Assert.Equal(auth.ExpiresAt.ToUnixTimeSeconds(), new DateTimeOffset(token.ValidTo).ToUnixTimeSeconds());
    }

    [Fact]
    public async Task ExpiredToken_Returns401Problem()
    {
        var client = CreateAnonymousClient();
        // Past the default five minutes of allowed clock skew.
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer",
            CreateToken(expiresAt: DateTime.UtcNow.AddMinutes(-10)));

        var response = await client.GetAsync("/api/reservations/me");

        await ProblemAssert.IsProblemAsync(response, HttpStatusCode.Unauthorized, "Authentication is required.");
    }

    // Signed with the test host's key, so only the lifetime makes it invalid.
    private static string CreateToken(DateTime expiresAt)
    {
        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(ApiFactory.JwtKey)),
            SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            issuer: ApiFactory.JwtIssuerAndAudience,
            audience: ApiFactory.JwtIssuerAndAudience,
            claims: [new Claim(ClaimTypes.NameIdentifier, "1"), new Claim(ClaimTypes.Role, "User")],
            notBefore: expiresAt.AddHours(-2),
            expires: expiresAt,
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
