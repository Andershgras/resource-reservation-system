# Architecture

The Resource Reservation System is a React single-page app backed by an ASP.NET Core Web API and SQL Server. The API owns every business rule. The frontend only presents data and collects input.

## System overview

```mermaid
flowchart LR
    Browser["React + TypeScript SPA<br/>(Vite)"]
    subgraph API["ASP.NET Core Web API"]
        Controllers["Controllers<br/>HTTP, auth attributes, status codes"]
        Services["Services<br/>business rules"]
        Data["AppDbContext<br/>EF Core"]
        Controllers --> Services --> Data
    end
    DB[("SQL Server")]

    Browser -- "JSON over HTTPS<br/>JWT bearer token" --> Controllers
    Data --> DB
```

## Backend layers

| Layer | Folder | Responsibility |
|---|---|---|
| Controllers | `Controllers/` | Routing, `[Authorize]` rules, reading the current user from the token, and turning service results into HTTP responses |
| Services | `Services/` | Business rules: availability, booking, cancellation, authentication, tokens and scheduling time |
| Data | `Data/`, `Models/`, `Migrations/` | EF Core model, database constraints and migrations |
| Contracts | `DTOs/` | Request and response shapes, with DataAnnotations validation |
| Configuration | `Configuration/` | Typed settings, validated when the app starts |

### Services return results, not exceptions

Services return `ServiceResult<T>`, which holds either a value or a `ServiceError`. The error has a kind (`Validation`, `Unauthorized`, `NotFound`, `Forbidden`, `Conflict` or `Unavailable`) and a message.

One controller extension, `ToErrorResult`, maps each kind to an HTTP status and an RFC 9457 problem details response. Exceptions are kept for real bugs. The global exception handler logs them and returns a 500 that leaks no internal details. See [ADR 0003](adr/0003-error-handling.md).

Services get the caller as a plain `CurrentUser(UserId, IsAdmin)` value, so they never depend on HTTP.

### Thin CRUD controllers

`ResourcesController`, `AvailabilitiesController` and `AvailabilityRulesController` still call EF Core directly. Their logic is simple create, read, update and delete with small overlap checks, so a service layer for them would add files without adding value. They return errors through the same `ToErrorResult` helper, so every error response has the same shape.

## Creating a reservation

The most important flow. The per-resource lock is what prevents double-booking ([ADR 0002](adr/0002-reservation-concurrency.md)).

```mermaid
sequenceDiagram
    actor User
    participant C as ReservationsController
    participant S as ReservationService
    participant A as AvailabilityService
    participant DB as SQL Server

    User->>C: POST /api/reservations (JWT)
    C->>S: CreateAsync(request, userId)
    S->>DB: user exists? resource exists and active?
    S->>S: end after start? starts in the future (Copenhagen time)?
    S->>A: IsWithinAvailabilityAsync
    A->>DB: one-off windows + weekly rules
    A-->>S: fits inside one merged interval?
    S->>DB: BEGIN TRAN + sp_getapplock("reservation:resource:{id}")
    alt lock not granted within timeout
        S-->>C: Unavailable
        C-->>User: 503 + Retry-After: 5
    else lock granted
        S->>DB: overlapping active reservation?
        alt overlap
            S-->>C: Conflict (transaction rolled back)
            C-->>User: 409 problem details
        else free
            S->>DB: INSERT reservation, COMMIT (releases lock)
            S-->>C: reservation
            C-->>User: 201 Created
        end
    end
```

## Data model

```mermaid
erDiagram
    USER ||--o{ RESERVATION : makes
    RESOURCE ||--o{ RESERVATION : "is booked by"
    RESOURCE ||--o{ AVAILABILITY : "has one-off windows"
    RESOURCE ||--o{ AVAILABILITY_RULE : "has weekly rules"

    USER {
        int Id PK
        string Name "max 100"
        string Email UK "max 255, lower-case"
        string PasswordHash "PBKDF2"
        string Role "Admin or User"
    }
    RESOURCE {
        int Id PK
        string Name "max 100"
        string Description "max 500"
        string Location "max 200"
        bool IsActive
    }
    AVAILABILITY {
        int Id PK
        int ResourceId FK
        datetime StartTime
        datetime EndTime
    }
    AVAILABILITY_RULE {
        int Id PK
        int ResourceId FK
        int DayOfWeek
        time StartTime
        time EndTime
    }
    RESERVATION {
        int Id PK
        int ResourceId FK
        int UserId FK
        datetime StartTime
        datetime EndTime
        string Status "Active or Cancelled"
    }
```

The database enforces the integrity rules as well:

- a unique, normalised email
- a check constraint on reservation status
- an index for the overlap query
- `RESTRICT` on reservation foreign keys, so deleting a user or resource can never remove booking history

All times are wall-clock times in the configured scheduling time zone, `Europe/Copenhagen` ([ADR 0001](adr/0001-time-zone-convention.md)).

## Cross-cutting concerns

| Concern | How it works |
|---|---|
| Authentication | JWT bearer tokens signed with HMAC-SHA256. They last `Jwt:ExpiryMinutes` (120 by default). |
| Authorization | `[Authorize]` and `[Authorize(Roles = "Admin")]` on controllers. Services check ownership. |
| Errors | RFC 9457 problem details for every error, with `traceId` |
| Configuration | Typed options validated at startup. See [configuration](configuration.md). |
| Security | Rate-limited login and registration, CORS, trusted proxies, security headers and HSTS. See [security](security.md). |
| Health | `/health/live` and `/health/ready` for the hosting platform. See [deployment](deployment.md#health-checks). |
| Time | `SchedulingClock` gives "now" in the scheduling time zone, through an injectable `TimeProvider` |

## Request pipeline

Middleware runs in this order for every request:

1. **Forwarded headers:** only when trusted proxies are configured. They set the real client IP address and scheme.
2. **Exception handler:** turns unhandled exceptions into a 500 problem response.
3. **HSTS:** outside Development only.
4. **Security headers:** added when the response starts, so they're present on every response.
5. **Swagger:** Development only.
6. **HTTPS redirection**
7. **CORS**
8. **Rate limiter:** after CORS, so the browser can read a 429. It only applies to the auth endpoints.
9. **Authentication and authorization**
10. **Endpoints:** the controllers and health checks.

## Frontend

The frontend is a Vite-built React and TypeScript app:

- `src/api/` holds the typed API clients. `client.ts` adds the bearer token, turns problem details into readable messages, and ends the session when the API rejects the token.
- `src/auth/authStorage.ts` stores the session and its expiry ([ADR 0004](adr/0004-token-storage-and-session-expiry.md)).
- `src/views/` holds the admin and user screens.
- `src/components/` holds the screen sections.
- State currently lives in `App.tsx`. Splitting it into feature hooks, and adding routing, is planned for Milestone 4 ([roadmap](roadmap.md)).

## Decision records

- [ADR 0001: Store times as wall-clock time in one configured time zone](adr/0001-time-zone-convention.md)
- [ADR 0002: Serialize bookings per resource with a SQL Server application lock](adr/0002-reservation-concurrency.md)
- [ADR 0003: Problem details for errors and result types for expected failures](adr/0003-error-handling.md)
- [ADR 0004: Keep the token in localStorage and handle session expiry in the frontend](adr/0004-token-storage-and-session-expiry.md)
- [ADR 0005: Database migrations as a separate deployment step](adr/0005-migrations-in-deployment.md)
