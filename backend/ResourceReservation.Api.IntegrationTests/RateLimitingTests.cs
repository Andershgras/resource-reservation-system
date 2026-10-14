using System.Net;
using System.Net.Http.Json;
using ResourceReservation.Api.Configuration;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.IntegrationTests.Infrastructure;

namespace ResourceReservation.Api.IntegrationTests;

public class RateLimitingTests : ApiTestBase
{
    private const int PermitLimit = 10;
    private const int EmailPermitLimit = 3;
    private const string ClientIp = "198.51.100.10";
    private const string ProxyIp = "10.0.0.5";

    public RateLimitingTests(ApiFixture fixture)
        : base(fixture)
    {
    }

    [Fact]
    public async Task Login_OverLimit_Returns429WithRetryAfter()
    {
        await using var factory = CreateFactory();
        var client = factory.CreateClient();

        await UseUpLimitAsync(client, ClientIp);
        var response = await LoginAsync(client, ClientIp);

        await ProblemAssert.IsProblemAsync(
            response,
            HttpStatusCode.TooManyRequests,
            AuthRateLimiting.RejectedMessage);
        // Retry-After is the refill interval, 60 / 10 = 6 seconds, not the time left.
        Assert.Equal("6", response.Headers.GetValues("Retry-After").Single());
    }

    // Registration, resending a verification link and asking for a reset all
    // send email, and share a stricter limit of their own. Sign-in has its own.
    [Fact]
    public async Task EmailRequests_ShareAStricterLimit_SeparateFromSignIn()
    {
        await using var factory = CreateFactory();
        var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.Accepted, (await RegisterAsync(client, ClientIp, 0)).StatusCode);
        Assert.Equal(HttpStatusCode.Accepted, (await PostEmailRequestAsync(client, ClientIp, "/api/auth/forgot-password")).StatusCode);
        Assert.Equal(HttpStatusCode.Accepted, (await PostEmailRequestAsync(client, ClientIp, "/api/auth/resend-verification")).StatusCode);
        var limited = await PostEmailRequestAsync(client, ClientIp, "/api/auth/forgot-password");

        await ProblemAssert.IsProblemAsync(limited, HttpStatusCode.TooManyRequests, AuthRateLimiting.RejectedMessage);
        // 900 seconds / 3 permits.
        Assert.Equal("300", limited.Headers.GetValues("Retry-After").Single());
        Assert.Equal(HttpStatusCode.TooManyRequests, (await RegisterAsync(client, ClientIp, 1)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await LoginAsync(client, ClientIp)).StatusCode);
        Assert.Equal(HttpStatusCode.Accepted, (await RegisterAsync(client, "198.51.100.11", 2)).StatusCode);
    }

    [Fact]
    public async Task ClientsBehindOneSharedIp_ShareOneLimit()
    {
        await using var factory = CreateFactory();

        // Two separate browsers, for example on the same office network.
        await UseUpLimitAsync(factory.CreateClient(), ClientIp);
        var response = await LoginAsync(factory.CreateClient(), ClientIp);

        Assert.Equal(HttpStatusCode.TooManyRequests, response.StatusCode);
    }

    [Fact]
    public async Task OtherIp_HasItsOwnLimit()
    {
        await using var factory = CreateFactory();
        var client = factory.CreateClient();

        await UseUpLimitAsync(client, ClientIp);
        var response = await LoginAsync(client, "198.51.100.11");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task ForwardedFor_WithoutTrustedProxy_DoesNotBypassLimit()
    {
        await using var factory = CreateFactory();
        var client = factory.CreateClient();

        for (var attempt = 0; attempt < PermitLimit; attempt++)
        {
            await LoginAsync(client, ClientIp, forwardedFor: $"203.0.113.{attempt}");
        }

        var response = await LoginAsync(client, ClientIp, forwardedFor: "203.0.113.200");

        Assert.Equal(HttpStatusCode.TooManyRequests, response.StatusCode);
    }

    [Fact]
    public async Task ForwardedFor_FromTrustedProxy_LimitsEachClientSeparately()
    {
        await using var factory = CreateFactory(new Dictionary<string, string>
        {
            ["ReverseProxy:KnownProxies:0"] = ProxyIp
        });
        var client = factory.CreateClient();

        for (var attempt = 0; attempt < PermitLimit; attempt++)
        {
            await LoginAsync(client, ProxyIp, forwardedFor: "203.0.113.1");
        }

        Assert.Equal(
            HttpStatusCode.TooManyRequests,
            (await LoginAsync(client, ProxyIp, forwardedFor: "203.0.113.1")).StatusCode);
        Assert.Equal(
            HttpStatusCode.Unauthorized,
            (await LoginAsync(client, ProxyIp, forwardedFor: "203.0.113.2")).StatusCode);
    }

    [Fact]
    public async Task OtherEndpoints_AreNotLimited()
    {
        await using var factory = CreateFactory();
        var client = factory.CreateClient();

        await UseUpLimitAsync(client, ClientIp);
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/resources");
        request.Headers.Add(TestRemoteIpStartupFilter.HeaderName, ClientIp);

        Assert.Equal(HttpStatusCode.OK, (await client.SendAsync(request)).StatusCode);
    }

    [Fact]
    public async Task RejectedResponse_IsReadableByAllowedOrigin()
    {
        const string origin = "https://app.example.test";
        await using var factory = CreateFactory(new Dictionary<string, string>
        {
            ["Cors:AllowedOrigins:0"] = origin
        });
        var client = factory.CreateClient();

        await UseUpLimitAsync(client, ClientIp);
        using var request = CreateLoginRequest(ClientIp);
        request.Headers.Add("Origin", origin);
        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.TooManyRequests, response.StatusCode);
        Assert.Equal(origin, response.Headers.GetValues("Access-Control-Allow-Origin").Single());
        Assert.Equal("Retry-After", response.Headers.GetValues("Access-Control-Expose-Headers").Single());
    }

    private ApiFactory CreateFactory(Dictionary<string, string>? settings = null)
    {
        settings ??= [];
        settings["RateLimiting:Auth:PermitLimit"] = PermitLimit.ToString();
        settings["RateLimiting:Auth:WindowSeconds"] = "60";
        settings["RateLimiting:Email:PermitLimit"] = EmailPermitLimit.ToString();
        settings["RateLimiting:Email:WindowSeconds"] = "900";

        return new ApiFactory(Fixture.ConnectionString, settings);
    }

    private static async Task UseUpLimitAsync(HttpClient client, string remoteIp)
    {
        for (var attempt = 0; attempt < PermitLimit; attempt++)
        {
            Assert.Equal(HttpStatusCode.Unauthorized, (await LoginAsync(client, remoteIp)).StatusCode);
        }
    }

    private static Task<HttpResponseMessage> LoginAsync(
        HttpClient client,
        string remoteIp,
        string? forwardedFor = null)
    {
        var request = CreateLoginRequest(remoteIp);

        if (forwardedFor is not null)
        {
            request.Headers.Add("X-Forwarded-For", forwardedFor);
        }

        return client.SendAsync(request);
    }

    private static HttpRequestMessage CreateLoginRequest(string remoteIp)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/auth/login")
        {
            Content = JsonContent.Create(new LoginUserDto
            {
                Email = "nobody@integration.test",
                Password = "WrongPassword123"
            })
        };
        request.Headers.Add(TestRemoteIpStartupFilter.HeaderName, remoteIp);

        return request;
    }

    private static Task<HttpResponseMessage> PostEmailRequestAsync(HttpClient client, string remoteIp, string path)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, path)
        {
            Content = JsonContent.Create(new AccountEmailRequestDto { Email = "nobody@integration.test" })
        };
        request.Headers.Add(TestRemoteIpStartupFilter.HeaderName, remoteIp);

        return client.SendAsync(request);
    }

    private static Task<HttpResponseMessage> RegisterAsync(HttpClient client, string remoteIp, int number)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/auth/register")
        {
            Content = JsonContent.Create(new RegisterUserDto
            {
                Name = "Rate Limited User",
                Email = $"rate-limited-{number}@integration.test",
                Password = "UserPassword123"
            })
        };
        request.Headers.Add(TestRemoteIpStartupFilter.HeaderName, remoteIp);

        return client.SendAsync(request);
    }
}
