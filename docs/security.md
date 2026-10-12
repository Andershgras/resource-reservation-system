# Security

This page describes how the application protects accounts and data, and lists the known limitations. Settings are described in [configuration](configuration.md), and the hosting setup in [deployment](deployment.md).

## Authentication

- **Passwords** are hashed with ASP.NET Core Identity's `PasswordHasher`: PBKDF2 with HMAC-SHA512, a random salt and many iterations. Passwords must be at least 8 characters.
- **Login** returns a JWT signed with HMAC-SHA256 using `Jwt:Key`. The API checks the signature, issuer, audience and lifetime of every token. ASP.NET Core allows five minutes of clock skew.
- **Tokens last** `Jwt:ExpiryMinutes`, 120 by default. The login response includes `expiresAt` and `expiresInSeconds`.
- **Wrong email and wrong password** give the same message: "Invalid email or password."
- **Registration** always creates a `User`. The client can't choose a role. The first Admin comes from the `SeedAdmin` settings.

## Authorization

- Admin-only endpoints use `[Authorize(Roles = "Admin")]`.
- Users can only see and cancel their own reservations. The service layer checks ownership; Admins can act on any reservation.
- Integration tests check that every protected endpoint returns 401 without a token, and every Admin endpoint returns 403 for a User.

## Sessions in the browser

The frontend keeps the token in `localStorage` ([ADR 0004](adr/0004-token-storage-and-session-expiry.md)).

- **Restoring a session:** a stored session is only restored if it hasn't expired. The expiry is timed on the browser's own clock from `expiresInSeconds`, so a wrong system clock doesn't end sessions early.
- **Expiry:** when the token's lifetime runs out, the frontend returns to the login screen and says the session has expired.
- **Rejected tokens:** a `401` for a request that sent a token ends the session the same way. A `401` without a token, such as a failed login, is shown as an ordinary error, so the login screen can't loop.
- **Logout** only removes the token from the browser. The token itself stays valid until it expires, because there is no server-side revocation.

**XSS risk.** Any script that runs on the frontend's origin can read `localStorage`, and so steal the token. The API's security headers protect API responses only. They don't protect the frontend's JavaScript. What reduces the risk today:

- React escapes rendered values, and the frontend doesn't use `dangerouslySetInnerHTML`.
- Tokens are short-lived.

**Before any public deployment** (Milestone 7), review moving the token to an httpOnly cookie, and give the frontend a strict Content-Security-Policy. This is tracked in the [roadmap](roadmap.md).

## Brute-force protection

- **Rate limit:** login and registration share a rate limit per client IP address. By default a client can make 10 attempts at once, then one more every 6 seconds. Further attempts get `429 Too Many Requests` with a `Retry-After` header giving the real wait.
- **Who counts as one client:**
  - Clients behind one shared address, such as an office network, share the limit.
  - IPv6 clients are counted per `/64` network, because one client usually controls a whole `/64`.
  - Behind a reverse proxy, the client address comes from `X-Forwarded-For`, but only when the proxy is configured as trusted. Otherwise a client could send a fake header to get a fresh limit.
- **Logging:** rejected attempts are logged as warnings.

## Transport and response headers

- **HTTPS:** a reverse proxy terminates HTTPS and redirects HTTP to HTTPS ([deployment](deployment.md#https-termination-and-redirection)). Outside Development, the API sends `Strict-Transport-Security` on HTTPS responses.
- **Forwarded headers:** `X-Forwarded-For` and `X-Forwarded-Proto` are only trusted from addresses in `ReverseProxy:KnownProxies` or `ReverseProxy:KnownNetworks`. ASP.NET Core's middleware trusts every address when its list is empty, so the API only enables it when at least one proxy is configured. A test checks that spoofed headers are otherwise ignored.
- **Response headers:** every response gets these, even when the exception handler has cleared the response:

| Header | Value | Why |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | Browsers must not guess a different content type |
| `X-Frame-Options` | `DENY` | No framing (clickjacking) |
| `Referrer-Policy` | `no-referrer` | URLs aren't leaked to other sites |
| `Content-Security-Policy` | `default-src 'none'; frame-ancestors 'none'` | API responses can't load or run anything. Swagger UI, in Development only, is excluded. |
| `Cache-Control` (on `/api`) | `no-store` | Responses with personal data aren't stored by browsers or proxies |

## Cross-origin requests

Only the origins in `Cors:AllowedOrigins` may call the API from a browser on another origin. Development also allows the local Vite dev server. The policy allows only the methods the API uses: `GET`, `POST`, `PUT` and `DELETE`.

## Errors and logging

Every error is an RFC 9457 problem response. Unexpected exceptions are logged on the server, and the client only gets a generic `500` with a `traceId` that links the response to the server log. Health endpoints return only `Healthy` or `Unhealthy`.

## Secrets

- **Development:** the JWT key and seed admin password in `appsettings.Development.json` are for local development only.
- **Production:** secrets are supplied through the hosting platform ([configuration](configuration.md#secrets)).
- **Never run production in the `Development` environment.**

## Known limitations

| Limitation | Effect | Plan |
|---|---|---|
| **Registration reveals existing accounts.** Registering an existing email returns "Email is already registered." | Anyone can check whether an email has an account, at the rate limit's pace | See [account enumeration](#account-enumeration) below |
| **Login timing reveals existing accounts.** For an unknown email, login returns before hashing the password. | A wrong password takes about 90 ms for an existing account and about 5 ms for an unknown one (measured locally), so timing reveals which emails exist | Proposed follow-up: hash a dummy password when the email is unknown, so both cases take the same time. No API change. |
| No account lockout | An attacker using many IP addresses isn't slowed down per account | Milestone 6, with user management. Lockout also lets attackers lock out real users, so it needs care. |
| No server-side logout or token revocation | A stolen token works until it expires | Short token lifetime for now. Revisit with the cookie review in Milestone 7. |
| Token in `localStorage` | Readable by any script that runs on the frontend's origin | Cookie review before public deployment (Milestone 7) |
| Rate limit counters are per API instance | With several instances, each one counts separately | A shared store such as Redis if the API is scaled out |
| No password reset or email verification | Users who forget their password need an Admin | Milestone 6 |
| The anonymous schedule endpoint returns reservation IDs (audit L10) | Minor information leak | Milestone 4 or 5, with the frontend changes it needs |

### Account enumeration

A registration response that doesn't reveal whether an email already exists isn't possible without email verification:

- **Return "account created" for existing emails as well:** that would mislead users. The person registering would believe they have an account, but their password wouldn't work, and the real owner would never hear about it.
- **Return a generic error for every failure:** new emails would still succeed and existing ones would still fail, so the response would still reveal the answer.

The clean solution is email verification. Registration would always answer "Check your inbox to continue", and the email would either confirm the new account or tell the existing owner that someone tried to register. That needs an email service, planned for Milestone 6.

**Interim approach:**
- Keep the current registration response, so the API contract doesn't change.
- Rely on the rate limit to slow enumeration to about 10 attempts per minute per IP address.
- Fix the login timing difference, so that login, the endpoint attackers use most, reveals nothing.
