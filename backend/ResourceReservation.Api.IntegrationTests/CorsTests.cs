using System.Net;
using ResourceReservation.Api.IntegrationTests.Infrastructure;

namespace ResourceReservation.Api.IntegrationTests;

public sealed class CorsTests : ApiTestBase, IDisposable
{
    private const string AllowedOrigin = "https://app.example.test";

    private readonly ApiFactory _factory;

    public CorsTests(ApiFixture fixture)
        : base(fixture)
    {
        _factory = new ApiFactory(
            fixture.ConnectionString,
            new Dictionary<string, string> { ["Cors:AllowedOrigins:0"] = AllowedOrigin });
    }

    public void Dispose()
    {
        _factory.Dispose();
    }

    [Fact]
    public async Task Preflight_FromConfiguredOrigin_IsAllowed()
    {
        var response = await SendPreflightAsync(AllowedOrigin);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(AllowedOrigin, GetHeader(response, "Access-Control-Allow-Origin"));
        Assert.Contains("POST", GetHeader(response, "Access-Control-Allow-Methods"));
    }

    [Theory]
    [InlineData("https://evil.example.test")]
    [InlineData("https://app.example.test.evil.test")]
    // The local Vite origins are only allowed in Development. The tests run as "Testing".
    [InlineData("http://localhost:5173")]
    public async Task Preflight_FromOtherOrigin_IsNotAllowed(string origin)
    {
        var response = await SendPreflightAsync(origin);

        Assert.Null(GetHeader(response, "Access-Control-Allow-Origin"));
    }

    [Fact]
    public async Task Request_FromConfiguredOrigin_ExposesRetryAfter()
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/resources");
        request.Headers.Add("Origin", AllowedOrigin);

        var response = await _factory.CreateBrowserClient().SendAsync(request);

        response.EnsureSuccessStatusCode();
        Assert.Equal(AllowedOrigin, GetHeader(response, "Access-Control-Allow-Origin"));
        Assert.Equal("Retry-After", GetHeader(response, "Access-Control-Expose-Headers"));
    }

    [Fact]
    public async Task Preflight_WithoutConfiguredOrigins_IsNotAllowed()
    {
        using var request = CreatePreflight(AllowedOrigin);

        var response = await CreateAnonymousClient().SendAsync(request);

        Assert.Null(GetHeader(response, "Access-Control-Allow-Origin"));
    }

    private async Task<HttpResponseMessage> SendPreflightAsync(string origin)
    {
        using var request = CreatePreflight(origin);

        return await _factory.CreateBrowserClient().SendAsync(request);
    }

    private static HttpRequestMessage CreatePreflight(string origin)
    {
        var request = new HttpRequestMessage(HttpMethod.Options, "/api/reservations");
        request.Headers.Add("Origin", origin);
        request.Headers.Add("Access-Control-Request-Method", "POST");
        request.Headers.Add("Access-Control-Request-Headers", "authorization,content-type");

        return request;
    }

    private static string? GetHeader(HttpResponseMessage response, string name)
    {
        return response.Headers.TryGetValues(name, out var values)
            ? string.Join(",", values)
            : null;
    }
}
