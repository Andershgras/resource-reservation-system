namespace ResourceReservation.Api.Configuration;

// Response headers that tell browsers to handle API responses defensively.
// They protect the API's own responses only. The frontend's pages need their
// own headers from whatever serves them.
public static class SecurityHeaders
{
    public static IApplicationBuilder UseSecurityHeaders(this IApplicationBuilder app)
    {
        return app.Use(async (context, next) =>
        {
            // Set when the response starts, so headers survive the exception
            // handler clearing the response.
            context.Response.OnStarting(() =>
            {
                var headers = context.Response.Headers;
                var path = context.Request.Path;

                headers.XContentTypeOptions = "nosniff";
                headers.XFrameOptions = "DENY";
                headers["Referrer-Policy"] = "no-referrer";

                // Swagger UI is an HTML page with scripts, served in Development only.
                if (!path.StartsWithSegments("/swagger"))
                {
                    headers.ContentSecurityPolicy = "default-src 'none'; frame-ancestors 'none'";
                }

                // API responses can contain personal data, so browsers and proxies must not store them.
                if (path.StartsWithSegments("/api"))
                {
                    headers.CacheControl = "no-store";
                }

                return Task.CompletedTask;
            });

            await next(context);
        });
    }
}
