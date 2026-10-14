# Security

This page describes how the application protects accounts and data, and lists the known limitations. Settings are described in [configuration](configuration.md), and the hosting setup in [deployment](deployment.md).

## Authentication

- **Passwords** are hashed with ASP.NET Core Identity's `PasswordHasher`: PBKDF2 with HMAC-SHA512, a random salt and many iterations. Passwords must be at least 8 characters.
- **Login** returns a JWT signed with HMAC-SHA256 using `Jwt:Key`. The API checks the signature, issuer, audience and lifetime of every token. ASP.NET Core allows five minutes of clock skew.
- **Tokens last** `Jwt:ExpiryMinutes`, 120 by default. The login response includes `expiresAt` and `expiresInSeconds`.
- **Tokens are checked against the database** on every authenticated request. The user must still be active, with the role and security stamp the token was issued with. Changing a role or deactivating an account sets a new stamp, so the user's existing tokens stop working on their next request ([ADR 0010](adr/0010-user-management-and-account-security.md)). Tokens carry a SHA-256 fingerprint of the stamp, never the stamp, and the API never returns it.
- **Every failed sign-in gets the same answer**, whether the email is unknown, the password is wrong or the account is locked: "Invalid email or password. After repeated failed attempts, sign-in pauses for a few minutes." Each also verifies one password hash and runs the same failure update, so they take about the same time ([login timing](#login-timing)).
- **Deactivated accounts** never get a token. They are told "This account has been deactivated." only after the right password.
- **Old password hashes are upgraded.** When the hasher reports an old format or work factor, the password is re-hashed at sign-in, but only if the stored hash is still the one that was verified.
- **Registration** always creates a `User`. The client can't choose a role. The first Admin comes from the `SeedAdmin` settings.
- **Email verification:** new accounts can't sign in, get a token or book until the address is confirmed. Confirming needs the emailed link and the account's password, so a link sent to someone who didn't register can't activate the account ([ADR 0011](adr/0011-email-flows.md)). Accounts from before verification existed count as confirmed.
- **Password reset** sets a new security stamp, which ends every session, clears any lockout and cancels the user's other links. Resetting an unconfirmed account sets it up again for the owner of the address: their name and password, a new creation time and stamp, and no failed attempts, lockout, links or email cooldowns from whoever registered it.

## Email links

Verification and reset links ([ADR 0011](adr/0011-email-flows.md)):

- **Tokens:** 256 random bits from the cryptographic random number generator, stored only as a SHA-256 hash.
- **Expiry:** 24 hours for verification and 1 hour for a reset, both configurable.
- **Single use:** a token is used up by one conditional `UPDATE`, so two requests with the same link can't both succeed. A newer link of the same kind cancels older ones.
- **Kept out of logs and history:** the token travels in the URL fragment, which browsers never send to a server. The page removes it from the address before drawing, and only posts it when the form is submitted, so a mail scanner opening the link can't use it up.
- **Never logged:** account emails are queued in memory only, and logged by kind and user ID. A test captures every log level through registration, verification and reset, and checks that no token, hash or link appears.
- **Throttled:** each account gets at most one email of each kind every 2 minutes, claimed atomically. The requests that send email also share a stricter per-IP rate limit.

## Authorization

- Admin-only endpoints use `[Authorize(Roles = "Admin")]`.
- **Roles and active status** change only through `PUT /api/users/{id}/role` and `/status`. Each change runs under a SQL Server application lock and re-checks that the acting admin is still an active admin. There is always at least one active admin, even when admins change each other at the same moment. Admins can't change their own account. The user list never includes password hashes, stamps or lockout state.
- Users can only see, move and cancel their own reservations. The service layer checks ownership; Admins can act on any reservation.
- The schedule is anonymous, but leaving out a reservation that is being moved (`excludeReservationId`) needs its owner or an admin. Anyone else gets 401 or 403, as when reading the reservation itself.
- Moves and cancellations can carry the reservation's `version`. A change based on an out-of-date copy is rejected with 409, so one person can't silently overwrite another's change ([ADR 0008](adr/0008-booking-policies-and-reservation-changes.md)).
- Who made a booking is only ever sent to its owner or an admin. The admin calendar gets names from the admin-only `GET /api/reservations/resource/{id}`; the public schedule carries times and closure reasons only, and tests check its JSON for every role.
- Closure reasons are public, since everyone sees them in the calendar. The admin form says so. Managing closures is admin only.
- Booking rules apply to admins too. The cap on upcoming bookings limits how much of the calendar one account can hold.
- Integration tests check that every protected endpoint returns 401 without a token, and every Admin endpoint returns 403 for a User.

## Sessions in the browser

The frontend keeps the token in `localStorage` ([ADR 0004](adr/0004-token-storage-and-session-expiry.md)).

- **Restoring a session:** a stored session is only restored if it hasn't expired. The expiry is timed on the browser's own clock from `expiresInSeconds`, so a wrong system clock doesn't end sessions early.
- **Expiry:** when the token's lifetime runs out, the frontend returns to the login screen and says the session has expired.
- **Rejected tokens:** a `401` for a request that sent a token ends the session the same way. A `401` without a token, such as a failed login, is shown as an ordinary error, so the login screen can't loop.
- **Logout** only removes the token from the browser. The token itself stays valid until it expires, unless its user's role or status changes, which revokes it.

**XSS risk.** Any script that runs on the frontend's origin can read `localStorage`, and so steal the token. The API's security headers protect API responses only. They don't protect the frontend's JavaScript. What reduces the risk today:

- React escapes rendered values, and the frontend doesn't use `dangerouslySetInnerHTML`.
- Tokens are short-lived.

**Before any public deployment** (Milestone 7), review moving the token to an httpOnly cookie, and give the frontend a strict Content-Security-Policy. `index.html` has one small inline script, which applies the saved theme before the page draws; a strict policy must allow it by its hash. This is tracked in the [roadmap](roadmap.md).

## Brute-force protection

- **Email rate limit:** registration, resending a verification link and asking for a reset share a separate, stricter limit per client IP address: 5 requests, then one every 3 minutes (`RateLimiting:Email`). It stops one client mailing many addresses; the per-account cooldown stops repeated emails to one address.
- **Rate limit:** login, email verification and password resets share one rate limit per client IP address. It uses ASP.NET Core's token bucket limiter, which works like this with the default settings (behaviour measured against the running API):
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
- **Account lockout:** five failed sign-ins in a row lock the account for 15 minutes (`AccountLockout` settings). This slows guessing one account's password from many addresses, which the per-IP limit can't. Details ([ADR 0010](adr/0010-user-management-and-account-security.md)):
  - Failures are counted with one atomic SQL `UPDATE`, so concurrent attempts each count once.
  - A token is only issued if the account is still unlocked, active and unchanged at that moment, so a correct password that races a lockout doesn't get in.
  - During a lockout even the right password gets the generic answer, and attempts don't extend the lockout.
  - A successful sign-in clears the count.
  - Locked and unknown accounts look the same from outside, so the lockout can't be used to find accounts.

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

**Fixed on 14 October 2026.** `npm audit` in `frontend/resource-reservation-client` now reports no vulnerabilities. The table records what was reported until then. Both packages are build and test tooling only. `npm ls --omit=dev` shows neither in the production dependency tree, and neither is in the built app that browsers download.

| Package | Advisories | Pulled in by | Exploit conditions | Fix |
|---|---|---|---|---|
| `brace-expansion` 5.0.9 | [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7) (high): deeply nested braces exhaust the stack. [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) (high): recursion in `parseCommaParts` exhausts the stack. [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) (medium): quadratic time on `{a},b}`-shaped input. | ESLint, through `minimatch` | An attacker must control a glob pattern that is expanded. Here, the only patterns are file globs in `eslint.config.js` and on the ESLint command line, which are written by developers and reviewed in pull requests. The worst outcome is a crashed or hanging lint run, a denial of service against a developer machine or CI job. | 5.0.12, released 14 September 2026 |
| `source-map-js` 1.2.1 | [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) (high): an indexed source map with a huge section offset blocks the event loop. | PostCSS (inside Vite), `css-tree` (inside jsdom), and `magicast` (inside the coverage tool) | An attacker must get a crafted indexed source map processed during a build or test run, for example through a compromised dependency that ships one. The project's own CSS has no source maps. The worst outcome is a hanging build or test run. | 1.2.2, released 30 September 2026 |

**Fix:** `npm audit fix --package-lock-only`, in its own pull request, once 1.2.2 was two weeks old. It changed only the two lockfile entries above, to `brace-expansion` 5.0.12 and `source-map-js` 1.2.2, because the parent packages already allowed the patched versions. `package.json` is unchanged, and lint, unit tests, build and smoke tests pass.

## Known limitations

| Limitation | Effect | Plan |
|---|---|---|
| **Login timing is reduced, not constant** | Small timing differences remain, such as the database lookup | See [login timing](#login-timing) below |
| **Lockout can be used against a user.** Anyone who knows an email can lock that account for 15 minutes at a time | The real user can't sign in during the lockout | Attempts during a lockout don't extend it, and the per-IP rate limit slows the attack. Admins can't unlock accounts by hand yet. |
| No server-side logout | A stolen token works until it expires, unless its user's role or status changes | Short token lifetime for now. Revisit with the cookie review in Milestone 7. |
| Token in `localStorage` | Readable by any script that runs on the frontend's origin | Cookie review before public deployment (Milestone 7) |
| Rate limit counters are per API instance | With several instances, each one counts separately | A shared store such as Redis if the API is scaled out |
| **Account emails are queued in memory** | A verification or reset email still queued when the API restarts is lost | The user asks for another. Booking emails use a database outbox and survive restarts. |
| **The response time floor has limits** | Under heavy load, registration and reset requests can take longer than 250 ms, and small timing differences could show again | Raise `AccountTokens:MinimumResponseMilliseconds` if needed |
| **Development email only** | Emails are written as files, not sent | A real provider in Milestone 7 |

Fixed in Milestone 6 PR 4: registration no longer reveals existing accounts, and users can reset a forgotten password themselves.

Fixed in Milestone 6 PR 3: per-account lockout, revocation of tokens when a role or status changes, and re-hashing of old password hashes.

Fixed in Milestone 5: the anonymous schedule no longer returns reservation IDs (audit L10). It lists reserved times only. Reservation responses include the owner's name and email, and only the owner or an admin can read them.

### Account enumeration

**Resolved in Milestone 6 PR 4** ([ADR 0011](adr/0011-email-flows.md)). Until then, registration answered "Email is already registered", because a generic answer isn't possible without email verification. The interim approach was to keep that answer, rely on the rate limit, and reduce the login timing difference.

Now every request that could reveal an account gives one answer:

| Request | Answer for any valid address | What happens behind it |
|---|---|---|
| Register | `202` "Check your inbox to finish creating your account…" | A new address gets an unconfirmed account and a link. An address with an account gets a notice, and the account is unchanged. |
| Resend verification | `202` "If that address has an account waiting to be confirmed, we've sent it a new link." | Only an unconfirmed, active account gets an email |
| Forgot password | `202` "If that address has an account, we've sent it a link to reset the password." | Only an active account gets an email |
| Sign in | The same `401` for every failure | A deactivated or unconfirmed account is only told so after the right password |

These requests also take about the same time:
- **Similar work:** registration hashes the password either way. An unknown or ineligible address runs a database statement that matches nothing, in place of the cooldown claim.
- **A minimum response time:** the three requests that may send email answer no sooner than 250 ms. Measured against the running API, forgot-password took 5.1 ms for an unknown address and 8.3 ms for an account before the floor. With it, all four cases measured (new and existing, for registration and forgot-password) had a median of about 262 ms, within 1 ms of each other.

Invalid input is still answered straight away, because it says nothing about accounts.

### Login timing

**The problem.** Password hashing is deliberately slow. Before the fix, login only hashed when the email existed, and returned straight away for an unknown email. Measured locally, a wrong password took about 90 ms for an existing account and about 5 ms for an unknown email, so response times revealed which emails have accounts.

**The mitigation.** For an unknown email, login now verifies the submitted password against a hash of a random password. The result is ignored, and the response is the same generic message. Since Milestone 6 PR 3, unknown emails also run the same failure update as wrong passwords, which matches no row but costs a similar database round trip. The hash:

- comes from the same `IPasswordHasher<User>` as real passwords, with the same algorithm, format and iteration count;
- is created once per hasher and reused, so each unknown-email login costs one verification, just like a real login.

Integration tests check that existing, unknown and locked accounts each verify a password exactly once, and that the hash used for unknown emails has the same format, PRF, iteration count and salt size as real hashes. After the fix, the same local measurement gave about 55 ms against about 52 ms.

Measured again after Milestone 6 PR 3, against the running API and LocalDB, with 40 attempts of each kind, the medians were:

| Attempt | Median |
|---|---|
| Unknown email | 50.4 ms |
| Wrong password | 51.2 ms |
| Locked account, right password | 49.4 ms |

The 10th–90th percentile range of each was within about 49–54 ms.

**Limitations.** This narrows the gap, but **login is not constant-time**. No artificial delay is added, and some differences remain:

- The database lookup and the rest of the request can take different amounts of time. Network and server load add noise that is much larger than these differences, but repeated measurements could still pick them up.
- If the iteration count is ever raised, hashes made before the change verify faster than new ones, until each account's next successful sign-in re-hashes its password.
- A wrong password updates one row and an unknown email updates none. Both are one indexed statement, so the difference is small compared with the hash.
- The first unknown-email login after the API starts also creates the reusable hash, so it takes about twice as long. This happens once per process.
- An email that isn't a valid address is rejected before any lookup. That only reveals the address's format, not whether an account exists.
- Registration and password reset have their own protection ([account enumeration](#account-enumeration)).
