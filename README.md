# Resource Reservation System

A finished full-stack MVP for reserving shared resources, built with ASP.NET Core Web API, SQL Server, React, TypeScript, and JWT authentication.

The project is designed as a portfolio project. It demonstrates practical backend development, relational database design, authentication, role-based authorization, frontend integration, validation, and automated verification in a realistic booking workflow.

## MVP Status

This project is complete as an MVP.

The application supports the core flow for a generic resource reservation system:

- Admins manage bookable resources
- Admins define one-off availability windows
- Admins define weekly availability rules, such as Monday to Friday from 08:00 to 16:00
- Users choose a resource first, then view generated bookable times
- Users create and cancel their own reservations
- Admins view and manage all reservations
- The backend prevents overlapping active reservations
- Cancelled reservations no longer block new reservations

The project intentionally stays generic. A resource can represent a meeting room, workspace, vehicle, sports court, equipment item, or another shared asset.

## Screenshots

### Admin Resource Management

![Admin resource management](docs/screenshots/admin-resources.png)

### Admin Weekly Schedule

![Admin weekly schedule](docs/screenshots/admin-weekly-schedule.png)

### User Resource Booking

![User resource-first booking flow](docs/screenshots/user-book-resource.png)

### User Reservations

![User reservations](docs/screenshots/user-reservations.png)

## Features

### Authentication And Authorization

- User registration
- User login
- JWT-based authentication
- Role-based access for Admin and User behavior
- Seeded development Admin account

### Admin Features

- Create, edit, and delete resources
- Mark resources active or inactive
- Create, edit, and delete one-off availability windows
- Create, edit, and delete weekly availability rules
- View all reservations
- Filter reservations by resource and status
- Cancel any active reservation

### User Features

- View active resources
- Select a resource before choosing a reservation time
- Load generated bookable times for a date range
- View schedule-style availability grouped by day
- Choose a time inside a bookable slot
- Create reservations
- View own reservations
- Cancel own active reservations

### Backend Rules

- Reservations require an active resource
- Reservation end time must be after start time
- Reservations must start in the future
- Reservations must fit inside the resource's availability, which is its one-off windows and weekly rules merged together. A booking can span adjacent windows, as long as it doesn't cross a gap.
- Active overlapping reservations are rejected with `409 Conflict`, including when the requests arrive at the same moment (see [ADR 0002](docs/adr/0002-reservation-concurrency.md))
- Cancelled reservations do not block new reservations
- Resources with reservation history cannot be deleted and should be marked inactive instead. The database enforces this too.
- Generated schedules cover at most 62 days per request and never offer time that has already passed
- All times are wall-clock times in one configured time zone, `Europe/Copenhagen` by default (see [ADR 0001](docs/adr/0001-time-zone-convention.md))

## Tech Stack

### Backend

- ASP.NET Core Web API
- C#
- Entity Framework Core
- SQL Server LocalDB
- JWT authentication
- Swagger / OpenAPI
- xUnit tests

### Frontend

- React
- TypeScript
- Vite
- Playwright smoke tests
- ESLint

### Tooling

- GitHub Actions
- Visual Studio / .NET CLI
- SQL Server LocalDB
- SQL Server Management Studio

## Project Structure

```text
backend/
  ResourceReservation.Api/
    Controllers/
    Data/
    DTOs/
    Migrations/
    Models/
    Services/

  ResourceReservation.Api.Tests/
  ResourceReservation.Api.IntegrationTests/

frontend/
  resource-reservation-client/
    src/
      api/
      auth/
      components/
      views/
    tests/
      smoke/

docs/
  adr/             architecture decision records
  audit/           project audits
  architecture.md  layers, request flow and data model diagrams
  testing.md       test suites, how to run them, and coverage
  planning.md
  roadmap.md
```

## Architecture Overview

The application is split into a backend API, a SQL Server database, and a React frontend. Diagrams of the layers, the reservation flow and the data model are in [docs/architecture.md](docs/architecture.md).

The backend owns the business rules. It exposes endpoints for authentication, resources, availability windows, weekly availability rules, generated resource schedules, and reservations.

SQL Server stores users, resources, availability windows, weekly rules, and reservations. Entity Framework Core maps the C# models to database tables and manages migrations.

The frontend provides role-based workflows. Admin users manage the booking setup. Normal users select a resource, view generated availability, and reserve a valid time slot.

## Domain Model

- `User` - a person who can log in and create reservations
- `Resource` - something that can be reserved
- `Availability` - a one-off date/time window where a resource can be booked
- `AvailabilityRule` - a recurring weekly rule for a resource, such as Monday 08:00-16:00
- `Reservation` - a concrete booking made by a user for a resource

## API Overview

### Auth

```text
POST /api/auth/register
POST /api/auth/login
```

### Resources

```text
GET    /api/resources
GET    /api/resources/{id}
GET    /api/resources/{id}/schedule?from=YYYY-MM-DD&to=YYYY-MM-DD   max 62 days
POST   /api/resources        Admin only
PUT    /api/resources/{id}   Admin only
DELETE /api/resources/{id}   Admin only
```

### Availability Windows

```text
GET    /api/availabilities
GET    /api/availabilities/{id}
POST   /api/availabilities        Admin only
PUT    /api/availabilities/{id}   Admin only
DELETE /api/availabilities/{id}   Admin only
```

### Weekly Availability Rules

```text
GET    /api/availabilityrules
GET    /api/availabilityrules/{id}
POST   /api/availabilityrules        Admin only
PUT    /api/availabilityrules/{id}   Admin only
DELETE /api/availabilityrules/{id}   Admin only
```

### Reservations

```text
GET /api/reservations                    Admin only
GET /api/reservations/{id}               Owner or Admin
GET /api/reservations/me                 Logged-in user
POST /api/reservations                   Logged-in user
PUT /api/reservations/{id}/cancel        Owner or Admin
GET /api/reservations/resource/{id}      Admin only
GET /api/reservations/user/{id}          Admin only
```

### Errors

Every error is returned as [RFC 9457 problem details](https://www.rfc-editor.org/rfc/rfc9457) with the content type `application/problem+json`. `detail` explains the problem, and `traceId` matches the server logs:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Conflict",
  "status": 409,
  "detail": "Resource is already reserved in this time period.",
  "traceId": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00"
}
```

Validation errors also include `errors`, keyed by field name. Unexpected server errors return a `500` with no internal details.

| Status | Meaning |
|---|---|
| `400` | Invalid input, or a business rule was broken (for example, outside availability or in the past) |
| `401` | Missing or invalid token |
| `403` | Authenticated, but not allowed |
| `404` | Resource, availability or reservation not found |
| `409` | The time overlaps an active reservation |
| `503` | Another booking for the same resource is in progress. Retry after the number of seconds in the `Retry-After` header. |

## Local Setup

### Prerequisites

- .NET SDK matching the project target framework
- Node.js
- SQL Server LocalDB
- Docker Desktop (only for the integration tests)

### Backend

From the repository root:

```bash
dotnet restore ResourceReservationSystem.slnx
dotnet ef database update --project backend/ResourceReservation.Api --startup-project backend/ResourceReservation.Api
dotnet run --project backend/ResourceReservation.Api/ResourceReservation.Api.csproj
```

`dotnet ef database update` also applies new migrations to an existing database. Migrations are written to keep existing data.

Swagger is available in development at:

```text
http://localhost:5052/swagger
```

Development connection string:

```text
Server=(localdb)\MSSQLLocalDB;Database=ResourceReservationDb;Trusted_Connection=True;TrustServerCertificate=True
```

### Development Admin User

The development Admin user is seeded from `appsettings.Development.json`:

```json
"SeedAdmin": {
  "Name": "Admin",
  "Email": "admin@example.com",
  "Password": "Admin1234"
}
```

### Frontend

Start the backend first. Then run:

```bash
cd frontend/resource-reservation-client
npm install
npm run dev
```

The Vite development server usually runs at:

```text
http://localhost:5173
```

The frontend expects the API at:

```text
http://localhost:5052/api
```

This can be overridden with `VITE_API_BASE_URL`.

## Verification

Backend tests:

```bash
dotnet test ResourceReservationSystem.slnx
```

This runs two suites:

- `ResourceReservation.Api.Tests`: fast unit tests of the controllers, using the EF Core in-memory provider.
- `ResourceReservation.Api.IntegrationTests`: the whole API over HTTP against a real SQL Server, started in Docker with [Testcontainers](https://dotnet.testcontainers.org/). They cover authorization, validation, booking concurrency, the unique email and the migrations.

See [docs/testing.md](docs/testing.md) for what each suite covers and how to produce a coverage report.

The integration tests need **Docker Desktop** to be running. To use an existing SQL Server instead, set `INTEGRATION_TEST_CONNECTION_STRING`. The database name must end in `_IntegrationTests`, because the tests delete all of its data between runs.

Frontend checks:

```bash
cd frontend/resource-reservation-client
npm run lint
npm run build
npm run test:smoke
```

The Playwright smoke tests cover the main browser flow: Admin login, resource management, weekly schedule management, availability management, User registration/login, resource-first booking, reservation cancellation, and overlap error handling.

## Continuous Integration

GitHub Actions runs on push and pull request.

The workflow restores and tests the backend, installs frontend dependencies, runs lint, builds the frontend, and runs the Playwright smoke tests. Pull requests fail if any check fails.

## Configuration

The API checks its settings at startup and stops with a message naming any setting that is missing or invalid. Settings can come from `appsettings.*.json`, user secrets, or environment variables. In environment variable names, `:` becomes `__`, so `Jwt:Key` is set as `Jwt__Key`.

| Setting | Required | Default | Notes |
|---|---|---|---|
| `ConnectionStrings:DefaultConnection` | Yes | None | SQL Server connection string |
| `Jwt:Key` | Yes | None | Signing secret, at least 32 characters. Keep it out of source control. |
| `Jwt:Issuer` | Yes | None | |
| `Jwt:Audience` | Yes | None | |
| `Jwt:ExpiryMinutes` | No | `120` | Token lifetime, 1–1440 minutes |
| `Scheduling:TimeZoneId` | Yes | `Europe/Copenhagen` | IANA time zone for all reservation times ([ADR 0001](docs/adr/0001-time-zone-convention.md)) |
| `Scheduling:BookingLockTimeoutMilliseconds` | No | `10000` | How long a booking waits for another booking of the same resource, 100–60000 ms ([ADR 0002](docs/adr/0002-reservation-concurrency.md)) |
| `Cors:AllowedOrigins` | No | None | Browser origins allowed to call the API from another origin, such as `https://app.example.com`. Exact origins only, with no path or wildcard. Leave empty when the frontend is served from the same origin. Development also allows the Vite dev server on `localhost` ports 5173–5185. |
| `SeedAdmin:Email` | No | None | If set, an Admin user is created on startup when no Admin exists yet |
| `SeedAdmin:Password` | When `SeedAdmin:Email` is set | None | At least 8 characters |
| `SeedAdmin:Name` | No | `Admin` | |

`appsettings.Development.json` contains working values for local development only.

## Deployment Notes

This project is prepared as a portfolio application, not a live production deployment.

For production-like hosting:

- Use a real SQL Server database instead of LocalDB
- Configure `ConnectionStrings:DefaultConnection` through the hosting environment
- Configure JWT settings and secrets outside source control
- Set `Scheduling:TimeZoneId` if the resources are not in `Europe/Copenhagen`. Use an IANA time zone ID.
- SQL Server is required, not just any EF Core provider: reservation locking uses `sp_getapplock`
- Set `VITE_API_BASE_URL` to the deployed backend URL
- If the frontend is on a different origin than the API, add it to `Cors:AllowedOrigins`
- Build the frontend as static files with `npm run build`

## Roadmap

The MVP has been audited for production readiness. See the [audit](docs/audit/2026-10-initial-audit.md) and the milestone [roadmap](docs/roadmap.md).

## Potential Future Improvements

These are intentionally outside the finished MVP, but would make good future issues:

- Availability exceptions for holidays, maintenance, or one-off closures
- Resource categories and filtering
- Better calendar controls for week/month navigation
- Reservation editing or rescheduling
- Admin analytics or utilization overview
- Calendar export
- Email notifications
- Docker setup
- Production deployment
- Multi-tenant organization support

## Portfolio Notes

This project is meant to show a complete, understandable MVP rather than an oversized production system.

It demonstrates:

- Full-stack feature development
- API design with DTOs
- Entity Framework Core migrations
- SQL Server persistence
- Authentication and authorization
- Business-rule validation
- Frontend state management
- Automated backend and frontend verification
