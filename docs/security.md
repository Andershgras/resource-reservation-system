# Security

This page describes how the application protects accounts and data, and lists the known limitations. Settings are described in [configuration](configuration.md), and the hosting setup in [deployment](deployment.md).

## Authentication

- **Passwords** are hashed with ASP.NET Core Identity's `PasswordHasher`: PBKDF2 with HMAC-SHA512, a random salt and many iterations. Passwords must be at least 8 characters.
- **Login** returns a JWT signed with HMAC-SHA256 using `Jwt:Key`. The API checks the signature, issuer, audience and lifetime of every token. ASP.NET Core allows five minutes of clock skew.
- **Tokens last** `Jwt:ExpiryMinutes`, 120 by default. The login response includes `expiresAt` and `expiresInSeconds`.
- **Wrong email and wrong password** give the same message: "Invalid email or password." Both also verify a password hash, so they take about the same time ([login timing](#login-timing)).
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

- **Rate limit:** login and registration share one rate limit per client IP address. It uses ASP.NET Core's token bucket limiter, which works like this with the default settings (behaviour measured against the running API):
  - **Burst:** each client starts with a full bucket of 10 tokens. Each attempt, successful or not, uses one, so 10 attempts in a row are allowed.
  - **Refill:** one token is added every 6 seconds (`WindowSeconds / PermitLimit`), up to 10. The limiter's internal timer adds them, so in practice a token arrives about every 6.1 seconds.
  - **Rate:** the sustained rate is about 10 attempts per minute. Because the bucket starts full, up to about 20 are possible in the first minute: the burst of 10, plus about 10 refills.
  - **When the bucket is empty:** the attempt gets `429 Too Many Requests` with `Retry-After: 6`. This is the refill interval, not the time left until the next token. ASP.NET Core's built-in limiters don't report the time remaining. So the next attempt may be allowed sooner than `Retry-After` says. Occasionally, because of the timer drift, it can come slightly later, and the client gets another 429.
  - **Why not a fixed window:** its `Retry-After` would always be the whole 60-second window, which overstates the wait far more.
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

## Dependency advisories

`npm audit` in `frontend/resource-reservation-client` reports the advisories below, as of 13 October 2026. Both packages are build and test tooling only. `npm ls --omit=dev` shows neither in the production dependency tree, and neither is in the built app that browsers download.

| Package | Advisories | Pulled in by | Exploit conditions | Fix |
|---|---|---|---|---|
| `brace-expansion` 5.0.9 | [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7) (high): deeply nested braces exhaust the stack. [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) (high): recursion in `parseCommaParts` exhausts the stack. [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) (medium): quadratic time on `{a},b}`-shaped input. | ESLint, through `minimatch` | An attacker must control a glob pattern that is expanded. Here, the only patterns are file globs in `eslint.config.js` and on the ESLint command line, which are written by developers and reviewed in pull requests. The worst outcome is a crashed or hanging lint run, a denial of service against a developer machine or CI job. | 5.0.12, released 14 September 2026 |
| `source-map-js` 1.2.1 | [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) (high): an indexed source map with a huge section offset blocks the event loop. | PostCSS (inside Vite), `css-tree` (inside jsdom), and `magicast` (inside the coverage tool) | An attacker must get a crafted indexed source map processed during a build or test run, for example through a compromised dependency that ships one. The project's own CSS has no source maps. The worst outcome is a hanging build or test run. | 1.2.2, released 30 September 2026 |

**Recommended fix:** in a separate pull request from 14 October 2026, when 1.2.2 is two weeks old, run `npm audit fix --package-lock-only`. This changes only the two lockfile entries above, because the parent packages already allow the patched versions, and leaves `package.json` unchanged. CI then confirms lint, unit tests, build and smoke tests still pass.

## Known limitations

| Limitation | Effect | Plan |
|---|---|---|
| **Registration reveals existing accounts.** Registering an existing email returns "Email is already registered." | Anyone can check whether an email has an account, at the rate limit's pace | See [account enumeration](#account-enumeration) below |
| **Login timing is reduced, not constant** | Small timing differences remain, such as the database lookup | See [login timing](#login-timing) below |
| No account lockout | An attacker using many IP addresses isn't slowed down per account | Milestone 6, with user management. Lockout also lets attackers lock out real users, so it needs care. |
| No server-side logout or token revocation | A stolen token works until it expires | Short token lifetime for now. Revisit with the cookie review in Milestone 7. |
| Token in `localStorage` | Readable by any script that runs on the frontend's origin | Cookie review before public deployment (Milestone 7) |
| Rate limit counters are per API instance | With several instances, each one counts separately | A shared store such as Redis if the API is scaled out |
| No password reset or email verification | Users who forget their password need an Admin | Milestone 6 |

Fixed in Milestone 5: the anonymous schedule no longer returns reservation IDs (audit L10). It lists reserved times only. Reservation responses include the owner's name and email, and only the owner or an admin can read them.

### Account enumeration

A registration response that doesn't reveal whether an email already exists isn't possible without email verification:

- **Return "account created" for existing emails as well:** that would mislead users. The person registering would believe they have an account, but their password wouldn't work, and the real owner would never hear about it.
- **Return a generic error for every failure:** new emails would still succeed and existing ones would still fail, so the response would still reveal the answer.

The clean solution is email verification. Registration would always answer "Check your inbox to continue", and the email would either confirm the new account or tell the existing owner that someone tried to register. That needs an email service, planned for Milestone 6.

**Interim approach (approved):**
- Keep the current registration response until email verification arrives in Milestone 6, so the API contract doesn't change.
- Rely on the rate limit to slow enumeration.
- Reduce the login timing difference ([login timing](#login-timing)).

### Login timing

**The problem.** Password hashing is deliberately slow. Before the fix, login only hashed when the email existed, and returned straight away for an unknown email. Measured locally, a wrong password took about 90 ms for an existing account and about 5 ms for an unknown email, so response times revealed which emails have accounts.

**The mitigation.** For an unknown email, login now verifies the submitted password against a hash of a random password. The result is ignored, and the response is the same generic "Invalid email or password." The hash:

- comes from the same `IPasswordHasher<User>` as real passwords, with the same algorithm, format and iteration count;
- is created once per hasher and reused, so each unknown-email login costs one verification, just like a real login.

Unit tests check that existing and unknown emails each verify a password exactly once, and that the hash used for unknown emails has the same format, PRF, iteration count and salt size as real hashes. After the fix, the same local measurement gave about 55 ms against about 52 ms.

**Limitations.** This narrows the gap, but **login is not constant-time**. No artificial delay is added, and some differences remain:

- The database lookup and the rest of the request can take different amounts of time. Network and server load add noise that is much larger than these differences, but repeated measurements could still pick them up.
- If the iteration count is ever raised, hashes made before the change verify faster than new ones. Login treats `SuccessRehashNeeded` as success but doesn't re-hash yet, so those accounts stay faster until their hash is replaced.
- The first unknown-email login after the API starts also creates the reusable hash, so it takes about twice as long. This happens once per process.
- An email that isn't a valid address is rejected before any lookup. That only reveals the address's format, not whether an account exists.
- Registration still reveals existing emails directly ([account enumeration](#account-enumeration)), so this fix protects login, not the system as a whole.
