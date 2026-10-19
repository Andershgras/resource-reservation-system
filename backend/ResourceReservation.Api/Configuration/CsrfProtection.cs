using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace ResourceReservation.Api.Configuration;

// Marks an endpoint that needs no anti-forgery token because it neither reads
// nor sets cookies, so a forged request can't use or change anyone's session.
// Only POST /api/auth/token has it. The Fetch Metadata and Origin checks still
// apply to it.
[AttributeUsage(AttributeTargets.Method)]
public sealed class NoAntiforgeryTokenAttribute : Attribute;

// Cross-site request forgery protection for every unsafe /api request (POST,
// PUT, PATCH, DELETE), in three layers (ADR 0012):
//
// 1. SameSite=Strict on the session cookie: browsers don't send it with
//    requests started by another site.
// 2. Fetch Metadata and Origin: a request a browser marks as coming from
//    another site or origin is rejected, unless that origin is in
//    Cors:AllowedOrigins.
// 3. ASP.NET Core anti-forgery tokens: the request must carry a request token,
//    bound to the signed-in user, that matches the anti-forgery cookie. Another
//    site can't read either.
//
// The only request that skips all three is one authenticated by a bearer token
// in the Authorization header that UserSessionValidator has accepted. Another
// site can't make a browser send that header, and has no token to send. A
// bearer header that fails validation leaves the request unauthenticated, and
// it is then checked like any other.
public static class CsrfProtection
{
    // Set by the JWT bearer events (Program.cs).
    private const string BearerHeaderItem = "rr:bearer-header";
    private const string ValidatedBearerItem = "rr:validated-bearer";

    public const string CrossSiteCode = "cross_site_request";
    public const string InvalidTokenCode = "csrf_token_invalid";

    public static void MarkBearerHeader(HttpContext context) => context.Items[BearerHeaderItem] = true;

    public static bool HasBearerHeader(HttpContext context) => context.Items.ContainsKey(BearerHeaderItem);

    public static void MarkValidatedBearer(HttpContext context) => context.Items[ValidatedBearerItem] = true;

    public static bool IsValidatedBearer(HttpContext context) =>
        context.Items.ContainsKey(ValidatedBearerItem) && context.User.Identity?.IsAuthenticated == true;

    // After authentication and authorization, and before the endpoints (Program.cs).
    public static IApplicationBuilder UseCsrfProtection(this IApplicationBuilder app)
    {
        return app.Use(async (context, next) =>
        {
            if (!IsUnsafe(context.Request.Method) ||
                !context.Request.Path.StartsWithSegments("/api") ||
                IsValidatedBearer(context))
            {
                await next(context);
                return;
            }

            if (!IsFromAllowedOrigin(context))
            {
                await WriteRejectionAsync(
                    context,
                    CrossSiteCode,
                    "Requests from other sites aren't allowed.");
                return;
            }

            var skipsToken = context.GetEndpoint()?.Metadata.GetMetadata<NoAntiforgeryTokenAttribute>() is not null;
            var antiforgery = context.RequestServices.GetRequiredService<IAntiforgery>();

            if (!skipsToken && !await antiforgery.IsRequestValidAsync(context))
            {
                await WriteRejectionAsync(
                    context,
                    InvalidTokenCode,
                    "Your session's security token is missing or out of date. Reload the page and try again.");
                return;
            }

            await next(context);
        });
    }

    private static bool IsUnsafe(string method)
    {
        return !(HttpMethods.IsGet(method) ||
            HttpMethods.IsHead(method) ||
            HttpMethods.IsOptions(method) ||
            HttpMethods.IsTrace(method));
    }

    // Browsers send Sec-Fetch-Site and Origin with every unsafe request. A
    // client that sends neither isn't a browser acting for another site, and
    // still needs a valid anti-forgery token.
    private static bool IsFromAllowedOrigin(HttpContext context)
    {
        var services = context.RequestServices;
        var frontendOrigin = services.GetRequiredService<IOptions<FrontendOptions>>().Value.Origin;
        var cors = services.GetRequiredService<IOptions<FrontendCorsOptions>>().Value;
        var origin = context.Request.Headers.Origin.ToString();
        var fetchSite = context.Request.Headers["Sec-Fetch-Site"].ToString();

        // The API's own origin, such as Swagger UI in Development. Behind nginx
        // it is the same as the frontend's.
        var ownOrigin = $"{context.Request.Scheme}://{context.Request.Host}";
        var isFrontendOrigin = string.Equals(origin, frontendOrigin, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(origin, ownOrigin, StringComparison.OrdinalIgnoreCase);
        var isCorsOrigin = origin.Length > 0 && cors.IsAllowed(origin);

        if (origin.Length > 0 && !isFrontendOrigin && !isCorsOrigin)
        {
            return false;
        }

        return fetchSite.Length == 0 ||
            string.Equals(fetchSite, "same-origin", StringComparison.OrdinalIgnoreCase) ||
            isCorsOrigin;
    }

    private static Task WriteRejectionAsync(HttpContext context, string code, string detail)
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;

        return context.RequestServices
            .GetRequiredService<IProblemDetailsService>()
            .WriteAsync(new ProblemDetailsContext
            {
                HttpContext = context,
                ProblemDetails = new ProblemDetails
                {
                    Status = StatusCodes.Status403Forbidden,
                    Detail = detail,
                    Extensions = { ["code"] = code }
                }
            })
            .AsTask();
    }
}
