using System.Net;
using System.Net.Sockets;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;

namespace ResourceReservation.Api.Configuration;

// Brute-force protection for login and registration. Rejected requests get a
// 429 problem response with Retry-After.
public static class AuthRateLimiting
{
    public const string PolicyName = "auth";

    public const string RejectedMessage = "Too many attempts. Please wait a moment and try again.";

    public static IServiceCollection AddAuthRateLimiting(this IServiceCollection services)
    {
        services.AddRateLimiter(_ => { });
        services.AddOptions<RateLimiterOptions>()
            .Configure<IOptions<AuthRateLimitOptions>>((options, authOptions) =>
            {
                var limits = authOptions.Value;

                // The built-in limiters don't report the time left until the next
                // permit. A token bucket's Retry-After is one refill interval (6 s by
                // default), while a fixed window's is the whole window (60 s).
                options.AddPolicy(PolicyName, context => RateLimitPartition.GetTokenBucketLimiter(
                    GetClientPartitionKey(context.Connection.RemoteIpAddress),
                    _ => new TokenBucketRateLimiterOptions
                    {
                        TokenLimit = limits.PermitLimit,
                        TokensPerPeriod = 1,
                        ReplenishmentPeriod = limits.GetReplenishmentPeriod(),
                        QueueLimit = 0,
                        AutoReplenishment = true
                    }));
                options.OnRejected = WriteRejectedResponseAsync;
            });

        return services;
    }

    // Requests are counted per client IP address. Behind a reverse proxy this is the
    // address from X-Forwarded-For, but only when the proxy is configured as trusted.
    // Clients that share an address, such as an office network, share one limit.
    public static string GetClientPartitionKey(IPAddress? address)
    {
        if (address is null)
        {
            return "unknown";
        }

        if (address.IsIPv4MappedToIPv6)
        {
            return address.MapToIPv4().ToString();
        }

        if (address.AddressFamily == AddressFamily.InterNetworkV6)
        {
            // One IPv6 client usually controls a whole /64, so count the network as one client.
            var bytes = address.GetAddressBytes();
            Array.Clear(bytes, 8, 8);

            return $"{new IPAddress(bytes)}/64";
        }

        return address.ToString();
    }

    private static async ValueTask WriteRejectedResponseAsync(
        OnRejectedContext context,
        CancellationToken cancellationToken)
    {
        var httpContext = context.HttpContext;

        if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
        {
            httpContext.Response.Headers.RetryAfter =
                Math.Max(1, (int)Math.Ceiling(retryAfter.TotalSeconds)).ToString();
        }

        httpContext.RequestServices
            .GetRequiredService<ILoggerFactory>()
            .CreateLogger(typeof(AuthRateLimiting))
            .LogWarning(
                "Rate limit reached for {Path} from {ClientPartition}.",
                httpContext.Request.Path,
                GetClientPartitionKey(httpContext.Connection.RemoteIpAddress));

        httpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;

        await httpContext.RequestServices
            .GetRequiredService<IProblemDetailsService>()
            .WriteAsync(new ProblemDetailsContext
            {
                HttpContext = httpContext,
                // The framework has no default title or type for 429.
                ProblemDetails = new ProblemDetails
                {
                    Type = "https://tools.ietf.org/html/rfc6585#section-4",
                    Title = "Too Many Requests",
                    Status = StatusCodes.Status429TooManyRequests,
                    Detail = RejectedMessage
                }
            });
    }
}
