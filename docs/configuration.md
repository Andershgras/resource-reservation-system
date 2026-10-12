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
| `RateLimiting:Auth:PermitLimit` | No | `10` | Login and registration attempts per client IP address, 1–10000 |
| `RateLimiting:Auth:WindowSeconds` | No | `60` | 1–3600 seconds. A client can make `PermitLimit` attempts at once, then one more every `WindowSeconds / PermitLimit` seconds. |

### Scheduling

| Setting | Required | Default | Notes |
|---|---|---|---|
| `Scheduling:TimeZoneId` | Yes | `Europe/Copenhagen` | IANA time zone for all reservation and availability times ([ADR 0001](adr/0001-time-zone-convention.md)) |
| `Scheduling:BookingLockTimeoutMilliseconds` | No | `10000` | How long a booking waits for another booking of the same resource, 100–60000 ms ([ADR 0002](adr/0002-reservation-concurrency.md)) |

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
