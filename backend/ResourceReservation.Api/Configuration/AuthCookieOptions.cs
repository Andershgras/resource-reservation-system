using Microsoft.AspNetCore.Http;

namespace ResourceReservation.Api.Configuration;

// The browser session cookie and the anti-forgery cookie (ADR 0012).
//
// By default both use the __Host- prefix and are always Secure: browsers then
// accept them only over HTTPS, for this exact host and path "/", and no other
// site or subdomain can set or overwrite them.
//
// AllowInsecureDevelopmentCookies drops the prefix and sends Secure only over
// HTTPS, so the Vite dev server works on plain http://localhost, where browsers
// disagree about Secure cookies. The API refuses to start with it outside
// Development (see Program.cs), so production always has strict cookies.
public class AuthCookieOptions
{
    public const string SectionName = "AuthCookies";

    public const string SessionCookieName = "__Host-rr-session";
    public const string AntiforgeryCookieName = "__Host-rr-csrf";
    public const string DevelopmentSessionCookieName = "rr-session";
    public const string DevelopmentAntiforgeryCookieName = "rr-csrf";

    // The header the frontend sends the anti-forgery request token in.
    public const string AntiforgeryHeaderName = "X-CSRF-TOKEN";

    public bool AllowInsecureDevelopmentCookies { get; set; }

    public string SessionCookie =>
        AllowInsecureDevelopmentCookies ? DevelopmentSessionCookieName : SessionCookieName;

    public string AntiforgeryCookie =>
        AllowInsecureDevelopmentCookies ? DevelopmentAntiforgeryCookieName : AntiforgeryCookieName;

    public CookieSecurePolicy SecurePolicy =>
        AllowInsecureDevelopmentCookies ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;

    // Options for the session cookie, both when it is set and when it is
    // deleted: a __Host- cookie can only be deleted with the same attributes.
    public CookieOptions CreateSessionCookieOptions(HttpRequest request, DateTimeOffset? expires)
    {
        return new CookieOptions
        {
            HttpOnly = true,
            Secure = SecurePolicy == CookieSecurePolicy.Always || request.IsHttps,
            SameSite = SameSiteMode.Strict,
            Path = "/",
            Expires = expires,
            IsEssential = true
        };
    }
}
