# Configuration

The API checks its settings when it starts. If a setting is missing or invalid, it stops with a message naming the setting, so bad configuration never serves a request.

## Where settings come from

Later sources override earlier ones:

1. `appsettings.json`: defaults that are safe to commit
2. `appsettings.{Environment}.json`, for example `appsettings.Development.json`
3. User secrets, in Development only (`dotnet user-secrets`)
4. Environment variables
5. Command-line arguments

In environment variable names, `:` becomes `__` (two underscores), and arrays use an index:

```bash
Jwt__Key=...
ConnectionStrings__DefaultConnection=...
Cors__AllowedOrigins__0=https://app.example.com
ReverseProxy__KnownProxies__0=10.0.0.5
```

## API settings

### Database

| Setting | Required | Default | Notes |
|---|---|---|---|
| `ConnectionStrings:DefaultConnection` | Yes | None | SQL Server connection string. The API's login only needs to read and write data. Migrations run separately with their own login ([deployment](deployment.md#database-migrations)). |

### Authentication

| Setting | Required | Default | Notes |
|---|---|---|---|
| `Jwt:Key` | Yes | None | Signing secret, at least 32 characters. **Secret:** keep it out of source control. Changing it ends every session. |
| `Jwt:Issuer` | Yes | None | |
| `Jwt:Audience` | Yes | None | |
| `Jwt:ExpiryMinutes` | No | `120` | Token lifetime, 1–1440 minutes. When it runs out, the user has to log in again. |
| `RateLimiting:Auth:PermitLimit` | No | `10` | 1–10000. The token bucket's size: how many login and registration attempts a client IP address can make in a row. |
| `RateLimiting:Auth:WindowSeconds` | No | `60` | 1–3600 seconds. One token is added every `WindowSeconds / PermitLimit` seconds, which is also the `Retry-After` value. The sustained rate is `PermitLimit` attempts per `WindowSeconds`. See [security](security.md#brute-force-protection). |
| `AccountLockout:MaxFailedAttempts` | No | `5` | 1–100. Failed sign-ins in a row that lock an account. A successful sign-in clears the count. |
| `AccountLockout:LockoutMinutes` | No | `15` | 1–1440 minutes. How long a lockout lasts. Attempts during it don't extend it. See [security](security.md#brute-force-protection). |

### Scheduling

| Setting | Required | Default | Notes |
|---|---|---|---|
| `Scheduling:TimeZoneId` | Yes | `Europe/Copenhagen` | IANA time zone for all reservation and availability times ([ADR 0001](adr/0001-time-zone-convention.md)) |
| `Scheduling:BookingLockTimeoutMilliseconds` | No | `10000` | How long a booking waits for another booking of the same resource or user, 100–60000 ms ([ADR 0002](adr/0002-reservation-concurrency.md)). Account changes wait for each other the same length of time ([ADR 0010](adr/0010-user-management-and-account-security.md)). |

### Booking rules

The defaults for every resource. The notice plus the shortest booking must fit within the days ahead, or the API won't start. An admin can override the first four for a single resource, and a resource without its own value follows the default, so changing a default here changes every such resource. The rules apply to every role, and only when a booking is made or moved. Existing bookings aren't re-checked. See [ADR 0008](adr/0008-booking-policies-and-reservation-changes.md).

| Setting | Required | Default | Notes |
|---|---|---|---|
| `BookingPolicy:MinDurationMinutes` | No | `15` | Shortest booking, 1–10080 minutes. Can't be more than the maximum. |
| `BookingPolicy:MaxDurationMinutes` | No | `480` | Longest booking, 1–10080 minutes |
| `BookingPolicy:MinLeadTimeMinutes` | No | `0` | How long before its start a booking must be made, 0–43200 minutes. 0 allows bookings that start now. |
| `BookingPolicy:MaxAdvanceDays` | No | `90` | How many days ahead, 1–3650. With 90, a booking can end at the latest at midnight after the day 90 days from today, in Copenhagen time. |
| `BookingPolicy:MaxActiveReservationsPerUser` | No | `5` | How many upcoming bookings (active and not yet ended) a user can hold across all resources, 1–1000 |

### Email

Emails are verification and reset links, account notices and booking emails ([ADR 0011](adr/0011-email-flows.md)). `Email:Delivery` has no default, so the API won't start until it is set: outside Development, emails can't silently go nowhere.

| Setting | Required | Default | Notes |
|---|---|---|---|
| `Email:Delivery` | Yes | None | How emails are delivered. Only `PickupDirectory` exists for now, which writes each email as an `.eml` file instead of sending it. Development sets it. A real provider comes in Milestone 7. |
| `Email:PickupDirectory` | With `PickupDirectory` | None | The folder for the `.eml` files, relative to the API's folder. Development uses `.dev-emails`, which git ignores, because the files hold working links. |
| `Email:FromAddress` | Yes | None | The sender address. Its domain also names calendar invitations, as in `reservation-42@example.com`. |
| `Email:FromName` | No | `Resource Reservation` | |
| `Frontend:BaseUrl` | Yes | None | Where the frontend runs, such as `https://app.example.com`, for the links in emails. Development uses `http://localhost:5173`. |
| `AccountTokens:EmailVerificationHours` | No | `24` | 1–168. How long a verification link works. |
| `AccountTokens:PasswordResetMinutes` | No | `60` | 5–1440. How long a reset link works. |
| `AccountTokens:EmailCooldownSeconds` | No | `120` | 0–3600. At most one email of each kind per account in this time. Extra requests get the usual answer and send nothing. |
| `AccountTokens:MinimumResponseMilliseconds` | No | `250` | 0–5000. Registration, resending a verification link and asking for a reset answer no sooner than this, so their timing doesn't reveal whether an address has an account. |
| `EmailOutbox:PollIntervalMilliseconds` | No | `5000` | 100–300000. How often the worker looks for booking emails to send. |
| `EmailOutbox:MaxAttempts` | No | `6` | 1–20. Attempts before a booking email is given up, recorded and logged as an error. |
| `EmailOutbox:FirstRetryDelaySeconds` | No | `30` | 1–3600. The wait after the first failure. Each later wait is four times longer, up to an hour. |
| `RateLimiting:Email:PermitLimit` | No | `5` | 1–10000. Requests that send email that a client IP address can make in a row. |
| `RateLimiting:Email:WindowSeconds` | No | `900` | 1–86400. One more such request is allowed every `WindowSeconds / PermitLimit` seconds. |

### Hosting

| Setting | Required | Default | Notes |
|---|---|---|---|
| `Cors:AllowedOrigins` | No | None | Browser origins that may call the API from another origin, such as `https://app.example.com`. Each entry must be an exact origin with no path or wildcard. Leave empty when the frontend and API share an origin. Development also allows the Vite dev server on `localhost` ports 5173–5185. |
| `ReverseProxy:KnownProxies` | No | None | IP addresses of reverse proxies whose `X-Forwarded-For` and `X-Forwarded-Proto` headers are trusted, such as `10.0.0.5`. With none configured, forwarded headers are ignored. |
| `ReverseProxy:KnownNetworks` | No | None | The same as `KnownProxies`, as CIDR ranges such as `10.0.0.0/24` |

See [deployment](deployment.md#https-termination-and-redirection) for how these fit together behind a reverse proxy.

### First admin account

| Setting | Required | Default | Notes |
|---|---|---|---|
| `SeedAdmin:Email` | No | None | If set, an Admin user with this email is created at startup when no Admin exists yet |
| `SeedAdmin:Password` | When `SeedAdmin:Email` is set | None | At least 8 characters. **Secret.** Change the password after the first login, then remove these settings. |
| `SeedAdmin:Name` | No | `Admin` | |

### Environment variables to leave unset

| Variable | Why |
|---|---|
| `ASPNETCORE_ENVIRONMENT=Development` in production | It loads the committed development key and seed password, enables Swagger and seeds demo data |
| `ASPNETCORE_FORWARDEDHEADERS_ENABLED` | It trusts forwarded headers from any address, so clients could fake their IP address and get around the rate limit |
| `ASPNETCORE_HTTPS_PORT`, `ASPNETCORE_HTTPS_PORTS` | Behind a reverse proxy, HTTPS redirection belongs to the proxy ([deployment](deployment.md#https-termination-and-redirection)) |

## Secrets

- **Development:** `appsettings.Development.json` contains a development JWT key and seed admin password. They are only for local use, and are only loaded when the environment is `Development`.
- **Production:** supply `Jwt:Key`, the connection string and any `SeedAdmin` values through the hosting platform's secret store or environment variables. Never put them in a committed file.
- **Generating a key:** for example, `openssl rand -base64 48`.

## Frontend settings

| Variable | Default | Notes |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:5052/api` | The API's base URL. It is baked into the build, so set it before `npm run build`. See `.env.example`. |

## Test settings

| Variable | Notes |
|---|---|
| `INTEGRATION_TEST_CONNECTION_STRING` | Runs the integration tests against this SQL Server instead of a Docker container. The database name must end in `_IntegrationTests`, because the tests delete all its data ([testing](testing.md)). |
