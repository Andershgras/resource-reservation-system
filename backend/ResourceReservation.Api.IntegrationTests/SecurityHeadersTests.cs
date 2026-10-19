using System.Net;
using ResourceReservation.Api.IntegrationTests.Infrastructure;

namespace ResourceReservation.Api.IntegrationTests;

public class SecurityHeadersTests : ApiTestBase
{
    private const string ProxyAddress = "10.0.0.5";

    public SecurityHeadersTests(ApiFixture fixture)
        : base(fixture)
    {
    }

    [Theory]
    [InlineData("/api/resources", HttpStatusCode.OK)]
    [InlineData("/api/resources/999999", HttpStatusCode.NotFound)]
    [InlineData("/api/reservations/me", HttpStatusCode.Unauthorized)]
    public async Task ApiResponses_IncludeSecurityHeaders(string path, HttpStatusCode expectedStatus)
    {
        var response = await CreateAnonymousClient().GetAsync(path);

        Assert.Equal(expectedStatus, response.StatusCode);
        Assert.Equal("nosniff", GetHeader(response, "X-Content-Type-Options"));
        Assert.Equal("DENY", GetHeader(response, "X-Frame-Options"));
        Assert.Equal("no-referrer", GetHeader(response, "Referrer-Policy"));
        Assert.Equal("default-src 'none'; frame-ancestors 'none'", GetHeader(response, "Content-Security-Policy"));
        Assert.Equal("no-store", response.Headers.CacheControl?.ToString());
    }

    [Fact]
    public async Task HttpsRequest_IncludesHsts()
    {
        var response = await SendAsync(Fixture.Factory, "https://api.example.test/api/resources");

        Assert.NotNull(GetHeader(response, "Strict-Transport-Security"));
    }

    [Fact]
    public async Task HttpRequest_DoesNotIncludeHsts()
    {
        var response = await SendAsync(Fixture.Factory, "http://api.example.test/api/resources");

        Assert.Null(GetHeader(response, "Strict-Transport-Security"));
    }

    [Fact]
    public async Task ForwardedProto_WithoutConfiguredProxies_IsIgnored()
    {
        var response = await SendAsync(
            Fixture.Factory,
            "http://api.example.test/api/resources",
            remoteIp: ProxyAddress,
            forwardedProto: "https");

        Assert.Null(GetHeader(response, "Strict-Transport-Security"));
    }

    [Theory]
    [InlineData(ProxyAddress, true)]
    [InlineData("10.0.0.9", false)]
    public async Task ForwardedProto_IsTrustedOnlyFromConfiguredProxy(string remoteIp, bool expectHttps)
    {
        await using var factory = new ApiFactory(
            Fixture.ConnectionString,
            new Dictionary<string, string> { ["ReverseProxy:KnownProxies:0"] = ProxyAddress });

        var response = await SendAsync(
            factory,
            "http://api.example.test/api/resources",
            remoteIp,
            forwardedProto: "https");

        Assert.Equal(expectHttps, GetHeader(response, "Strict-Transport-Security") is not null);
    }

    [Fact]
    public async Task ForwardedProto_FromConfiguredNetwork_IsTrusted()
    {
        await using var factory = new ApiFactory(
            Fixture.ConnectionString,
            new Dictionary<string, string> { ["ReverseProxy:KnownNetworks:0"] = "10.0.0.0/24" });

        var response = await SendAsync(
            factory,
            "http://api.example.test/api/resources",
            remoteIp: "10.0.0.200",
            forwardedProto: "https");

        Assert.NotNull(GetHeader(response, "Strict-Transport-Security"));
    }

    // HSTS is never sent for localhost, so these requests use another host name.
    private static async Task<HttpResponseMessage> SendAsync(
        ApiFactory factory,
        string url,
        string? remoteIp = null,
        string? forwardedProto = null)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, url);

        if (remoteIp is not null)
        {
            request.Headers.Add(TestRemoteIpStartupFilter.HeaderName, remoteIp);
        }

        if (forwardedProto is not null)
        {
            request.Headers.Add("X-Forwarded-Proto", forwardedProto);
        }

        var response = await factory.CreateBrowserClient().SendAsync(request);
        response.EnsureSuccessStatusCode();

        return response;
    }

    private static string? GetHeader(HttpResponseMessage response, string name)
    {
        return response.Headers.TryGetValues(name, out var values)
            ? string.Join(",", values)
            : null;
    }
}
