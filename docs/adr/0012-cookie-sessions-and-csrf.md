# ADR 0012: Browser Sessions In An httpOnly Cookie, With Server-Side Sign-Out And CSRF Protection

- **Status:** Accepted. Replaces [ADR 0004](0004-token-storage-and-session-expiry.md).
- **Date:** 2026-10-19
- **Related findings:** M3 in the [initial audit](../audit/2026-10-initial-audit.md)

## Context

Since Milestone 3 the frontend kept its JWT in `localStorage` and sent it as a bearer token ([ADR 0004](0004-token-storage-and-session-expiry.md)). Any script that runs on the frontend's origin can read `localStorage`, so one XSS bug would hand the session to an attacker, who could keep using it elsewhere until it expired. Signing out only removed the token from the browser. ADR 0004 deferred httpOnly cookies until the hosting was decided, and made reviewing them a condition for any public deployment.

Milestone 7 PR 1 settled the hosting: nginx serves the frontend and the API on one origin, over HTTPS, also on a developer's machine. That makes cookies practical:

- no CORS with credentials
- `SameSite=Strict` cookies
- the `__Host-` prefix, which needs HTTPS

Cookies bring their own risk, cross-site request forgery (CSRF): the browser attaches them to requests that another site starts. The protection had to be robust, not just a custom header.

## Decision

### The session cookie

`POST /api/auth/login` signs the user in and puts the token in a cookie named `__Host-rr-session`:

- **`HttpOnly`:** scripts can't read it, so XSS can't copy the session.
- **`Secure` and the `__Host-` prefix:** browsers accept it only over HTTPS, for this exact host, with `Path=/` and no `Domain`. No subdomain or other site can set or overwrite it.
- **`SameSite=Strict`:** browsers don't send it with requests that another site starts, including links and form posts.
- **`Expires`** is the token's expiry, so the browser drops it when the session ends.

The response returns the user and the session's expiry, never the token.

The cookie holds the same signed JWT as before. The bearer handler reads the token from an `Authorization: Bearer` header first, and otherwise from the cookie. Everything that checks a token is unchanged, and both ways in share it: the signature and lifetime, and the database check of the user's status, role and security stamp on every request ([ADR 0010](0010-user-management-and-account-security.md)). We rejected ASP.NET Core's cookie authentication handler, because it would have meant a second token format and a second validation path.

### Sessions on the server

Every sign-in creates a row in a new `UserSessions` table: a random ID, the user, the client (`Browser` or `Token`), and when the session was created, expires and was revoked. The token carries the session ID (claim `sess`).

`UserSessionValidator` checks, on every authenticated request and in the same query as the user, that the session:

- exists
- belongs to the token's user
- hasn't expired
- hasn't been revoked

**It fails closed.** These are all rejected:

- a token without a session ID
- a session that can't be found or belongs to someone else
- anything that doesn't match

A database error isn't caught, so the request fails rather than passing.

- **`POST /api/auth/logout`** revokes the current session and deletes the cookie. Other sessions of the same user, such as on another device, keep working. A copy of the signed-out cookie or token no longer works.
- **Signing in again** in a browser revokes that browser's previous session.
- **A security stamp change** still ends every session at once, as before: a role change, deactivation or password reset.
- **`GET /api/auth/me`** returns the signed-in user and the session's remaining lifetime. The frontend calls it on page load to restore a session.

### CSRF protection

Every unsafe `/api` request (POST, PUT, PATCH or DELETE) is checked in three independent layers:

1. **`SameSite=Strict`** on the session cookie, as above.
2. **Fetch Metadata and Origin.** A request is rejected if `Sec-Fetch-Site` is anything but `same-origin`, or if its `Origin` is neither the frontend's (`Frontend:BaseUrl`) nor the API's own, such as Swagger UI in Development, unless that origin is listed in `Cors:AllowedOrigins`. Browsers send both headers with every unsafe request.
3. **ASP.NET Core anti-forgery tokens.** The request must carry a token in `X-CSRF-TOKEN` that matches the anti-forgery cookie, `__Host-rr-csrf`, which is also httpOnly, `Secure` and `Strict`. The token is bound to the signed-in user and protected by the Data Protection keys. The frontend gets it from `GET /api/auth/csrf`. Another site can read neither the token nor the cookie.

A rejection is a `403` problem response with a `code` of `cross_site_request` or `csrf_token_invalid`, and the request changes nothing.

**Sign-in is protected too.** Without that, another site could sign a visitor into the attacker's account (login CSRF).

The check runs after authentication and authorization, and before the endpoint. An unauthenticated request to a protected endpoint gets its `401` first, which has no side effects and is how the frontend notices an ended session.

**Exemptions.** Two kinds of request skip the anti-forgery token:

- **A request authenticated by a bearer header that passed every check.** A cross-site attacker can't make a browser send an `Authorization` header, and has no token to send. A bearer header that fails validation leaves the request unauthenticated, and it is checked like any other. The mere presence of the header exempts nothing.
- **`POST /api/auth/token`**, which neither reads nor sets cookies. A forged request can't use or change anyone's session through it, and another site can't read its response. Requests to it still go through the Fetch Metadata and Origin checks, so a browser on another site can't use it either.

### Bearer tokens for other clients

`POST /api/auth/token` returns the token in its body, to be sent as a bearer header. It sets no cookie, creates a `Token` session, and has the same lockout and rate limit as sign-in. `POST /api/auth/logout` with that bearer header revokes it.

This is the one change other clients must make: `/login` no longer returns a token. Keeping the token in `/login`'s body would let any script on the page read it at the moment of sign-in, which would undo much of what the httpOnly cookie protects.

### Data Protection keys

The anti-forgery tokens depend on ASP.NET Core's Data Protection keys. `DataProtection:KeysDirectory` keeps them in a folder, a volume in Docker Compose, under a fixed application name, so tokens survive a restart. Session cookies are JWTs and don't depend on these keys. If the keys are lost anyway, the frontend fetches a new token and retries once.

### The frontend

- **Session state:** nothing about the session is stored in the browser. The user and expiry are kept in memory, from the sign-in response or from `/api/auth/me` on page load. The route guards wait while the app finds out.
- **One non-secret hint:** `resource-reservation-signed-in` lets the login screen say "Your session has expired" after a reload.
- **Old tokens:** a token stored by an earlier version is removed on load and never sent.
- **Expiry handling** is as before ([ADR 0004](0004-token-storage-and-session-expiry.md)): a timer from `expiresInSeconds` on the device's own clock. A `401` for a request made while signed in ends the session. A late `401` from an older session can't end a newer one, which a session counter now ensures in place of comparing tokens.
- **The anti-forgery token:**
  - It is fetched once, and shared by parallel requests. Each first fetch sets a new anti-forgery cookie, so separate fetches would invalidate each other.
  - It is fetched again after signing in or out, because it is bound to the user.
  - After a `csrf_token_invalid` rejection, the app fetches a new token and retries once.
- **Signing out** happens in the app at once, and the request revokes the session on the server. Scripts can't delete an httpOnly cookie, so a sign-out that fails, for example while offline, is remembered, and the next page load finishes it before asking who is signed in. Until it succeeds, nobody counts as signed in.

### Local development

The Vite dev server proxies `/api` to the API, so development is same-origin as well, and never needs CORS with credentials. It runs on plain `http://localhost`, where browsers disagree about `Secure` and `__Host-` cookies. So `AuthCookies:AllowInsecureDevelopmentCookies`, set only in `appsettings.Development.json`, names the cookies `rr-session` and `rr-csrf` and marks them `Secure` only over HTTPS. Everything else stays the same, including `HttpOnly`, `SameSite=Strict` and the CSRF checks.

**The API refuses to start with this setting in any environment other than Development.** Production and Docker Compose always use the strict `__Host-` cookies over HTTPS.

## Consequences

- **XSS can no longer copy the session.** Injected script could still act as the user while the page is open, by making requests from the page. The Content-Security-Policy from PR 1 makes injecting script much harder.
- **Signing out is real:** the session is revoked on the server, for one device at a time.
- **One more database row per sign-in.** Rows stay after they expire. The clean-up job planned for Milestone 7 PR 3 removes them.
- **Everyone signs in once more**, because tokens stored by earlier versions are removed and never used.
- **Other clients use `/api/auth/token`.** The other unsafe endpoints that work without signing in, such as registration and password reset, need an anti-forgery token, which in practice means a browser. Those flows end in links that open the frontend anyway.
- **A cross-origin frontend,** listed in `Cors:AllowedOrigins`, can use bearer tokens from `/api/auth/token`, but not the session cookie.
- **Development and production cookies differ** only in name and the `Secure` attribute, and a startup check keeps the relaxed form out of production.
- **The Vite dev server needs port 5173**, which is fixed with `strictPort`, because the API only accepts unsafe requests from `Frontend:BaseUrl`'s origin.
