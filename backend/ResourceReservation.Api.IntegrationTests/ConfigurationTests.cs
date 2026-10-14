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
    [InlineData("BookingPolicy:MinDurationMinutes", "0", "BookingPolicy:MinDurationMinutes must be between 1 and 10080.")]
    [InlineData("BookingPolicy:MinDurationMinutes", "600", "BookingPolicy:MinDurationMinutes cannot be greater than BookingPolicy:MaxDurationMinutes.")]
    [InlineData("BookingPolicy:MinLeadTimeMinutes", "-1", "BookingPolicy:MinLeadTimeMinutes must be between 0 and 43200.")]
    [InlineData("BookingPolicy:MaxAdvanceDays", "0", "BookingPolicy:MaxAdvanceDays must be between 1 and 3650.")]
    [InlineData("BookingPolicy:MaxActiveReservationsPerUser", "0", "BookingPolicy:MaxActiveReservationsPerUser must be between 1 and 1000.")]
    [InlineData("AccountLockout:MaxFailedAttempts", "0", "AccountLockout:MaxFailedAttempts must be between 1 and 100.")]
    [InlineData("AccountLockout:LockoutMinutes", "0", "AccountLockout:LockoutMinutes must be between 1 and 1440.")]
    [InlineData("Email:Delivery", "", "Email:Delivery is required.")]
    [InlineData("Email:Delivery", "Carrier pigeon", "Email:Delivery must be PickupDirectory.")]
    [InlineData("Email:PickupDirectory", "", "Email:PickupDirectory is required when Email:Delivery is PickupDirectory.")]
    [InlineData("Email:FromAddress", "not-an-address", "Email:FromAddress 'not-an-address' is not an email address.")]
    [InlineData("Frontend:BaseUrl", "", "Frontend:BaseUrl is required.")]
    [InlineData("Frontend:BaseUrl", "app.example.test", "Frontend:BaseUrl 'app.example.test' must be an absolute http or https URL")]
    [InlineData("AccountTokens:EmailVerificationHours", "0", "AccountTokens:EmailVerificationHours must be between 1 and 168.")]
    [InlineData("AccountTokens:PasswordResetMinutes", "1", "AccountTokens:PasswordResetMinutes must be between 5 and 1440.")]
    [InlineData("AccountTokens:EmailCooldownSeconds", "-1", "AccountTokens:EmailCooldownSeconds must be between 0 and 3600.")]
    [InlineData("RateLimiting:Email:PermitLimit", "0", "RateLimiting:Email:PermitLimit must be between 1 and 10000.")]
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
    public void Startup_WithBookingRulesNoBookingCouldMeet_Fails()
    {
        using var factory = new ApiFactory(
            Fixture.ConnectionString,
            new Dictionary<string, string>
            {
                ["BookingPolicy:MinLeadTimeMinutes"] = "2880",
                ["BookingPolicy:MaxAdvanceDays"] = "1"
            });

        var exception = Assert.ThrowsAny<Exception>(() => factory.CreateClient());

        Assert.Contains(
            "BookingPolicy:MinLeadTimeMinutes plus BookingPolicy:MinDurationMinutes must fit within BookingPolicy:MaxAdvanceDays.",
            exception.ToString());
    }

    [Fact]
    public async Task Startup_WithValidSettings_ServesRequests()
    {
        var response = await CreateAnonymousClient().GetAsync("/api/resources");

        response.EnsureSuccessStatusCode();
    }
}
