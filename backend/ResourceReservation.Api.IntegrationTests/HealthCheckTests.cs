using System.Net;
using Microsoft.Data.SqlClient;
using ResourceReservation.Api.IntegrationTests.Infrastructure;

namespace ResourceReservation.Api.IntegrationTests;

public class HealthCheckTests : ApiTestBase
{
    public HealthCheckTests(ApiFixture fixture)
        : base(fixture)
    {
    }

    [Theory]
    [InlineData("/health/live")]
    [InlineData("/health/ready")]
    public async Task HealthEndpoints_WithDatabase_AreHealthy(string path)
    {
        var response = await CreateAnonymousClient().GetAsync(path);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Healthy", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task HealthEndpoints_WithUnreachableDatabase_ReportReadinessOnly()
    {
        var brokenConnectionString = new SqlConnectionStringBuilder(Fixture.ConnectionString)
        {
            InitialCatalog = "Missing_IntegrationTests"
        }.ConnectionString;
        await using var factory = new ApiFactory(brokenConnectionString);
        var client = factory.CreateBrowserClient();

        var live = await client.GetAsync("/health/live");
        var ready = await client.GetAsync("/health/ready");

        Assert.Equal(HttpStatusCode.OK, live.StatusCode);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, ready.StatusCode);
        // Only the status, with no database or exception details.
        Assert.Equal("Unhealthy", await ready.Content.ReadAsStringAsync());
    }
}
