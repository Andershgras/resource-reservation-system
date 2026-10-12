# Testing

The project has three automated test suites, and CI runs all of them on every push and pull request.

| Suite | Location | What it checks | Needs |
|---|---|---|---|
| Backend unit tests | `backend/ResourceReservation.Api.Tests` | Business rules in the services, and the CRUD controllers | .NET SDK |
| Backend integration tests | `backend/ResourceReservation.Api.IntegrationTests` | The whole API over HTTP against a real SQL Server | .NET SDK and Docker Desktop |
| Frontend smoke tests | `frontend/resource-reservation-client/tests/smoke` | The main browser flows in Playwright, with the API mocked | Node.js |

## Running the tests

Backend, both suites:

```bash
dotnet test ResourceReservationSystem.slnx
```

Run one suite, or filter to individual tests:

```bash
dotnet test backend/ResourceReservation.Api.Tests
dotnet test backend/ResourceReservation.Api.IntegrationTests --filter "FullyQualifiedName~ReservationTests"
```

Frontend:

```bash
cd frontend/resource-reservation-client
npm run lint
npm run build
npm run test:smoke
```

## Backend unit tests

These run in about a second, with no external dependencies.

- **Service tests** (`ReservationServiceTests`, `AuthServiceTests`, `AvailabilityServiceTests`) cover the business rules:
  - availability and merged windows
  - bookings in the past
  - overlaps and cancellations
  - ownership
  - the schedule date range
  - registration and login
- **Controller tests** cover the CRUD controllers for resources, availability windows and weekly rules. `ControllerExtensionsTests` checks how service errors map to HTTP status codes.
- **Database:** tests use the EF Core in-memory provider. It doesn't enforce constraints, transactions or locks; the integration tests cover those.
- **Time:** tests that depend on "now" use `TestSchedulingClock`, which wraps a `FakeTimeProvider` with a fixed time in `Europe/Copenhagen`.

## Backend integration tests

These host the real API with `WebApplicationFactory` and run it against SQL Server 2022 in a Docker container, through [Testcontainers](https://dotnet.testcontainers.org/). They cover everything the in-memory tests can't:

- **Authorization:** 401 on every protected endpoint, 403 on every admin endpoint, and the public endpoints.
- **Error format:** ProblemDetails responses, including validation errors and an unhandled 500 that leaks no details.
- **Concurrency:**
  - 10 parallel identical bookings give one 201 and nine 409s. With the booking lock disabled, all ten succeed.
  - A held booking lock gives a 503 with `Retry-After`.
- **Registration:** parallel registrations with the same email, and email normalization.
- **Startup configuration:** each kind of invalid setting stops the app with a message naming the setting.
- **Migrations:** they apply to an empty database and match the EF model.

How the harness works (`Infrastructure/ApiFixture.cs`):

1. One container is started per test run and shared by every test class.
2. The real EF migrations are applied before the API starts.
3. Before each test, [Respawn](https://github.com/jbogard/Respawn) deletes all data and a test admin is seeded again.
4. Tests in the shared collection run one at a time, because they share the database.

### Running without Docker

Point the tests at any SQL Server you have, for example LocalDB:

```bash
INTEGRATION_TEST_CONNECTION_STRING="Server=(localdb)\MSSQLLocalDB;Database=ResourceReservation_IntegrationTests;Trusted_Connection=True;TrustServerCertificate=True" \
  dotnet test backend/ResourceReservation.Api.IntegrationTests
```

The tests delete all data in this database. To prevent accidents, the harness refuses any database whose name doesn't end in `_IntegrationTests`.

## Frontend smoke tests

Playwright drives Chromium against the Vite dev server, with the API mocked using `page.route`. The mocks return the same RFC 9457 problem details as the real API. The tests cover:

- the admin flows
- the user booking flow
- the overlap error
- per-field validation errors

Because the API is mocked, these tests don't prove the frontend and backend work together. An end-to-end suite against the real stack is planned for Milestone 7.

## Code coverage

CI collects coverage from both backend suites. It publishes a summary on the run page and uploads the HTML report as the `backend-coverage-report` artifact. EF migrations and generated code are excluded.

To produce the same report locally:

```bash
dotnet tool restore
dotnet test ResourceReservationSystem.slnx --collect:"XPlat Code Coverage" --results-directory TestResults/coverage/raw
dotnet reportgenerator -reports:"TestResults/coverage/raw/**/coverage.cobertura.xml" -targetdir:TestResults/coverage/report -reporttypes:Html -assemblyfilters:"+ResourceReservation.Api" -classfilters:"-ResourceReservation.Api.Migrations.*;-Microsoft.AspNetCore.OpenApi.Generated*;-System.Runtime.CompilerServices*"
```

Then open `TestResults/coverage/report/index.html`. Git ignores `TestResults/`.
