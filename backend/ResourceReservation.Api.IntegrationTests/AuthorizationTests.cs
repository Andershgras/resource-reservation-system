using System.Net;
using System.Net.Http.Json;
using ResourceReservation.Api.IntegrationTests.Infrastructure;

namespace ResourceReservation.Api.IntegrationTests;

public class AuthorizationTests : ApiTestBase
{
    public AuthorizationTests(ApiFixture fixture)
        : base(fixture)
    {
    }

    public static TheoryData<string, string> ProtectedEndpoints => new()
    {
        { "GET", "/api/reservations" },
        { "GET", "/api/reservations/me" },
        { "GET", "/api/reservations/1" },
        { "POST", "/api/reservations" },
        { "PUT", "/api/reservations/1/cancel" },
        { "POST", "/api/resources" },
        { "PUT", "/api/resources/1" },
        { "DELETE", "/api/resources/1" },
        { "POST", "/api/availabilities" },
        { "POST", "/api/availabilityrules" },
        { "PUT", "/api/reservations/1" },
        { "GET", "/api/bookingpolicy" },
        { "GET", "/api/availabilityexceptions" },
        { "POST", "/api/availabilityexceptions/preview" },
        { "POST", "/api/availabilityexceptions" },
        { "DELETE", "/api/availabilityexceptions/1" }
    };

    public static TheoryData<string, string> AdminOnlyEndpoints => new()
    {
        { "GET", "/api/reservations" },
        { "GET", "/api/reservations/resource/1" },
        { "GET", "/api/reservations/resource/1?from=2030-01-14&to=2030-01-20" },
        { "GET", "/api/reservations/user/1" },
        { "POST", "/api/resources" },
        { "PUT", "/api/resources/1" },
        { "DELETE", "/api/resources/1" },
        { "POST", "/api/availabilities" },
        { "PUT", "/api/availabilities/1" },
        { "DELETE", "/api/availabilities/1" },
        { "POST", "/api/availabilityrules" },
        { "PUT", "/api/availabilityrules/1" },
        { "DELETE", "/api/availabilityrules/1" },
        { "GET", "/api/availabilityexceptions" },
        { "POST", "/api/availabilityexceptions/preview" },
        { "POST", "/api/availabilityexceptions" },
        { "DELETE", "/api/availabilityexceptions/1" }
    };

    [Theory]
    [MemberData(nameof(ProtectedEndpoints))]
    public async Task ProtectedEndpoint_WithoutToken_ReturnsUnauthorized(string method, string path)
    {
        var client = CreateAnonymousClient();

        var response = await client.SendAsync(CreateRequest(method, path));

        await ProblemAssert.IsProblemAsync(response, HttpStatusCode.Unauthorized, "Authentication is required.");
    }

    [Theory]
    [MemberData(nameof(AdminOnlyEndpoints))]
    public async Task AdminEndpoint_AsUser_ReturnsForbidden(string method, string path)
    {
        var client = await CreateUserClientAsync();

        var response = await client.SendAsync(CreateRequest(method, path));

        await ProblemAssert.IsProblemAsync(
            response,
            HttpStatusCode.Forbidden,
            "You do not have permission to access this resource.");
    }

    [Fact]
    public async Task AdminEndpoint_AsAdmin_ReturnsOk()
    {
        var client = await CreateAdminClientAsync();

        var response = await client.GetAsync("/api/reservations");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Theory]
    [InlineData("/api/resources")]
    [InlineData("/api/availabilities")]
    [InlineData("/api/availabilityrules")]
    public async Task PublicEndpoint_WithoutToken_ReturnsOk(string path)
    {
        var client = CreateAnonymousClient();

        var response = await client.GetAsync(path);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    private static HttpRequestMessage CreateRequest(string method, string path)
    {
        var request = new HttpRequestMessage(new HttpMethod(method), path);

        if (method is "POST" or "PUT")
        {
            request.Content = JsonContent.Create(new { });
        }

        return request;
    }
}
