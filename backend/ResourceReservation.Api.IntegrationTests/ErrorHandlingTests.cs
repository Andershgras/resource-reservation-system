using System.Net;
using Microsoft.Data.SqlClient;
using ResourceReservation.Api.IntegrationTests.Infrastructure;

namespace ResourceReservation.Api.IntegrationTests;

public class ErrorHandlingTests : ApiTestBase
{
    public ErrorHandlingTests(ApiFixture fixture)
        : base(fixture)
    {
    }

    [Fact]
    public async Task UnhandledException_ReturnsProblemWithoutExceptionDetails()
    {
        // A database that does not exist makes every query throw.
        var brokenConnectionString = new SqlConnectionStringBuilder(Fixture.ConnectionString)
        {
            InitialCatalog = "Missing_IntegrationTests"
        }.ConnectionString;
        await using var factory = new ApiFactory(brokenConnectionString);

        var response = await factory.CreateClient().GetAsync("/api/resources");

        var problem = await ProblemAssert.IsProblemAsync(response, HttpStatusCode.InternalServerError);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Null(problem.Detail);
        Assert.DoesNotContain("Missing_IntegrationTests", body);
        Assert.DoesNotContain("SqlException", body);
        // The exception handler clears the response, but the security headers are still sent.
        Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.Equal("no-store", response.Headers.CacheControl?.ToString());
    }
}
