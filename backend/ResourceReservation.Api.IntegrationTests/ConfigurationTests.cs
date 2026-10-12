using ResourceReservation.Api.IntegrationTests.Infrastructure;

namespace ResourceReservation.Api.IntegrationTests;

public class ConfigurationTests : ApiTestBase
{
    public ConfigurationTests(ApiFixture fixture)
        : base(fixture)
    {
    }

    [Theory]
    [InlineData("Scheduling:TimeZoneId", "Mars/Olympus", "Scheduling:TimeZoneId 'Mars/Olympus' is not a known time zone.")]
    [InlineData("Scheduling:TimeZoneId", "", "Scheduling:TimeZoneId is required.")]
    [InlineData("Jwt:Key", "too-short", "Jwt:Key must be at least 32 characters.")]
    [InlineData("Jwt:Issuer", "", "Jwt:Issuer is required.")]
    [InlineData("Jwt:ExpiryMinutes", "0", "Jwt:ExpiryMinutes must be between 1 and 1440.")]
    [InlineData("SeedAdmin:Email", "seed@integration.test", "SeedAdmin:Password must be at least 8 characters")]
    [InlineData("Cors:AllowedOrigins:0", "https://app.example.test/path", "Cors:AllowedOrigins entry 'https://app.example.test/path' must be an origin")]
    [InlineData("Cors:AllowedOrigins:0", "*", "Cors:AllowedOrigins entry '*' must be an origin")]
    [InlineData("Cors:AllowedOrigins:0", "https://*.example.test", "Cors:AllowedOrigins entry 'https://*.example.test' must be an origin")]
    [InlineData("ReverseProxy:KnownProxies:0", "proxy.example.test", "ReverseProxy:KnownProxies entry 'proxy.example.test' is not an IP address.")]
    [InlineData("ReverseProxy:KnownNetworks:0", "10.0.0.0", "ReverseProxy:KnownNetworks entry '10.0.0.0' is not a CIDR range")]
    [InlineData("RateLimiting:Auth:PermitLimit", "0", "RateLimiting:Auth:PermitLimit must be between 1 and 10000.")]
    [InlineData("RateLimiting:Auth:WindowSeconds", "0", "RateLimiting:Auth:WindowSeconds must be between 1 and 3600.")]
    [InlineData("ConnectionStrings:DefaultConnection", "", "ConnectionStrings:DefaultConnection is required.")]
    public void Startup_WithInvalidSetting_FailsWithMessageNamingTheSetting(
        string key,
        string value,
        string expectedMessage)
    {
        using var factory = new ApiFactory(
            Fixture.ConnectionString,
            new Dictionary<string, string> { [key] = value });

        var exception = Assert.ThrowsAny<Exception>(() => factory.CreateClient());

        Assert.Contains(expectedMessage, exception.ToString());
    }

    [Fact]
    public async Task Startup_WithValidSettings_ServesRequests()
    {
        var response = await CreateAnonymousClient().GetAsync("/api/resources");

        response.EnsureSuccessStatusCode();
    }
}
