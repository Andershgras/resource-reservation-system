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
