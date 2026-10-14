# Testing

The project has four automated test suites, and CI runs all of them on every push and pull request.

| Suite | Location | What it checks | Needs |
|---|---|---|---|
| Backend unit tests | `backend/ResourceReservation.Api.Tests` | Business rules in the services, and the CRUD controllers | .NET SDK |
| Backend integration tests | `backend/ResourceReservation.Api.IntegrationTests` | The whole API over HTTP against a real SQL Server | .NET SDK and Docker Desktop |
| Frontend unit tests | `frontend/resource-reservation-client/src/**/*.test.ts(x)` | Helpers, session handling, the API client, query hooks, routing, pages, and accessibility of the shared components | Node.js |
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
npm run test:unit
npm run build
npm run test:smoke
```

`npm run test:unit:watch` reruns the unit tests on every change.

## Backend unit tests

These run in about a second, with no external dependencies.

- **Service tests** (`ReservationServiceTests`, `AuthServiceTests`, `AvailabilityServiceTests`, `BookingPolicyTests`) cover the business rules:
  - availability and merged windows
  - bookings in the past
  - overlaps and cancellations
  - ownership
  - the schedule date range
  - the booking rules: their defaults, resource overrides, the edges of each rule, the cap on upcoming bookings, and how the schedule follows them
  - moving a booking: its own old time, overlaps, the rules, the cap, cancelled and started bookings, and out-of-date versions
  - when a booking was made and cancelled, and by whom
  - existing bookings that break today's rules staying valid
  - closures (`ClosureTests`): overlapping closures combined but deleted one by one, closed time limited to opening hours, booking and moving at the closure's edges, both Copenhagen daylight-saving changes, and previews and saves that never cancel
  - registration. Sign-in uses `ExecuteUpdate`, which the in-memory provider can't run, so it is tested against SQL Server.
- **Controller tests** cover the CRUD controllers for resources, availability windows and weekly rules. `ControllerExtensionsTests` checks how service errors map to HTTP status codes.
- **Database:** tests use the EF Core in-memory provider. It doesn't enforce constraints, transactions or locks; the integration tests cover those.
- **Time:** tests that depend on "now" use `TestSchedulingClock`, which wraps a `FakeTimeProvider` with a fixed time in `Europe/Copenhagen`.
- **Booking rules:** `TestBookingPolicy` gives the production defaults, except that bookings can be made years ahead, because the test bookings are dated 2030 and the test clock is in 2029. Tests of the horizon set their own.

## Backend integration tests

These host the real API with `WebApplicationFactory` and run it against SQL Server 2022 in a Docker container, through [Testcontainers](https://dotnet.testcontainers.org/). They cover everything the in-memory tests can't:

- **Authorization:** 401 on every protected endpoint, 403 on every admin endpoint, and the public endpoints.
- **Error format:** ProblemDetails responses, including validation errors and an unhandled 500 that leaks no details.
- **Concurrency:**
  - 10 parallel identical bookings give one 201 and nine 409s. With the booking lock disabled, all ten succeed.
  - 10 parallel bookings by one user across 10 resources give exactly the cap of 5. With the user lock disabled, all ten succeed.
  - A held resource or user lock gives a 503 with `Retry-After`.
  - A move and a cancellation of the same booking in parallel: one succeeds and the other gets 409, in every round. Without the `rowversion` check turned into a 409, the loser gets a 500.
  - Two moves, or a move and a new booking, into the same free time: only one succeeds.
  - Two admins removing each other at the same moment, by role or by status, leave exactly one active admin. An admin demoted while their request waits for the user administration lock is refused. With the lock held elsewhere, a change waits and returns 503. Without the re-check under the lock, these tests fail.
  - Concurrent failed sign-ins each count once, and racing right and wrong passwords lock the account once and let no right password through.
  - Closures and bookings share the resource lock. With the lock held elsewhere, creating a closure waits and returns 503. A booking waiting for the lock is refused once a closure is saved meanwhile, because availability is checked under the lock. Each test fails with its protection removed. A parallel test also checks that a booking either is listed as affected or is refused.
- **Closures:** the full flow through the API, bookings made between preview and save, deleting one of two overlapping closures, the admin-only reservations for a week, and that the public schedule never names who booked.
- **Booking rules and moves:** resource overrides saved and applied to bookings and the schedule, overrides that contradict the defaults rejected beside their field, the real 90-day horizon with dates relative to today, out-of-date versions, and the schedule leaving out a booking being moved only for its owner or an admin.
- **Registration:** parallel registrations with the same email, and email normalization.
- **Sign-in and lockout (`LoginTests`):**
  - the lockout: five failures lock even the right password out, attempts during it don't extend it, it ends after 15 minutes on a fake clock, and a success clears the count
  - the same answer for unknown emails, wrong passwords and locked accounts, each verifying exactly one hash, with the stand-in hash in the same format as real ones
  - a deactivated account revealed only after the right password, and never given a token
  - a lockout or deactivation that lands while the password is being checked, and a password changed during a re-hash, using a hasher the test pauses mid-sign-in
  - old-format hashes upgraded at sign-in
  - the stamp never in a response, and only its fingerprint in the token
  - Each race test fails with its protection removed.
- **User management (`UserManagementTests`):**
  - a demoted admin loses access at once with the token they already have, and a deactivated user too, keeping their reservations
  - changes that change nothing keep sessions
  - tokens without a stamp, with another stamp or with another role are rejected
  - admins can't change their own account
  - the list is paged and searchable, never shows secrets, and is admin only
  - validation, including a missing `isActive`
- **Security configuration:**
  - CORS for configured and unknown origins
  - forwarded headers trusted only from configured proxies
  - security headers and HSTS
  - rate limiting per client IP, including shared and spoofed addresses
  - health checks
  - expired tokens and the login expiry fields
- **Startup configuration:** each kind of invalid setting stops the app with a message naming the setting.
- **Migrations:** they apply to an empty database and match the EF model. `MigrationDataTests` upgrades a separate database holding data from before Milestone 6, and checks every row survives, with unknown audit times left empty and no booking rule overrides. A second test upgrades users from before PR 3. They stay active, each get their own stamp, and can sign in and use their token afterwards.

The shared test API allows bookings 3650 days ahead, because the test bookings are dated 2030. `BookingPolicyTests` checks the real default with its own API instance.

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

## Frontend unit tests

[Vitest](https://vitest.dev/) runs these in a simulated browser ([jsdom](https://github.com/jsdom/jsdom)), with [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/) for components. They run in a few seconds and need no server.

- **Time zone:** the tests run in `Europe/Copenhagen`, set in `vite.config.ts`, so date handling behaves the same locally and on CI runners that use UTC. The date tests include both summer-time switches.
- **`src/lib/`:** date formatting and conversion, form validation including booking rules, the calendar model and its duration limits, the booking rules described in words, and error messages. The date and calendar tests cover both summer-time switches, a UTC instant that is already the next day in Copenhagen, periods off the 15-minute grid or shorter than 15 minutes, midnight, and malformed periods.
- **The booking screen** (`BookingPage.test.tsx`): the week loaded, every day shown including fully booked and closed days, choosing and booking a time within the booking rules, a clash with another booking, a schedule that fails to load, and where the booking form opens on small and wide screens. In move mode: the booking shown and left out of the schedule, the move sent with its version, the return to ordinary booking, a 409, and bookings that can't be moved.
- **Closures and freshness** (`BookingPage.test.tsx`): closed time with its reasons; reloading every minute while visible, keeping the week and a time being chosen; and waiting in the background until focus returns. The refresh tests fail without the live options.
- **The admin calendar** (`AdminCalendar.test.tsx`): owners shown, free time only while moving, moving a booking with its version, and the user calendar never asking for owners.
- **Closures screen** (`AdminClosuresPage.test.tsx`): field checks, the confirmation listing affected bookings, bookings made after the preview, refusals, deleting one closure, and axe with the dialog open.
- **Users screen** (`AdminUsersPage.test.tsx`): roles and status shown, no actions on your own account, confirmations that explain the effect, refusals from the API, search and pages in the address, and axe with the dialog open.
- **Sign-in page** (`AuthPage.test.tsx`): field checks, the generic failed sign-in message, and the deactivated account message.
- **Theme** (`theme.test.tsx`): reading and saving the choice, storage being unavailable, the switch, and the two dark token blocks staying identical.
- **My reservations** (`MyReservationsPage.test.tsx`): when each booking was made, moved and cancelled, in Copenhagen time; which bookings offer Move; and cancelling with the version.
- **Admin resources** (`AdminResourcesPage.test.tsx`): the booking rules form, with its defaults, checks, API errors and unsaved changes.
- **The unsaved-changes guard** (`useUnsavedChangesGuard.test.tsx`): Stay, Discard, Escape, the back button, a quick Stay followed by another navigation, same-screen changes, reloads, logout and session expiry. `src/test/renderScreen.tsx` renders a screen in a data router with a signed-in user, as the app does.
- **`src/auth/authStorage.ts`:** session expiry, using fake timers. Covered cases:
  - restoring a valid, expired or outdated session
  - ending only the session whose token was rejected
- **`src/api/client.ts`:** with `fetch` stubbed. Covered cases:
  - headers and body
  - problem-details messages
  - a 401 ending the session only when a token was sent
- **`AuthProvider`:** restoring a session, and clearing the query cache on login, logout and expiry.
- **Query hooks** (`src/features/*/…Queries.test.tsx`): `renderHook` with a fresh query client from `src/test/queryWrapper.tsx`, and the API modules mocked with `vi.mock`. They check:
  - what each hook loads
  - that failed loads aren't retried
  - which data each change refreshes, for example that cancelling a reservation reloads the booking schedule (audit L2)
- **Routing** (`src/app/App.test.tsx`): the route table in a memory router, with the layouts stubbed. It checks:
  - login redirects with `returnTo`, and ignoring `returnTo` values that leave the app
  - role redirects
  - logout
  - the not-found page
- **Pages:**
  - the admin reservation filters in the address (`AdminReservationsPage.test.tsx`)
  - parsing the booking address (`bookingSearch.test.ts`), including impossible dates and reversed ranges

### Accessibility tests

`src/test/axe.ts` runs [axe-core](https://github.com/dequelabs/axe-core) on rendered markup and lists any violations:

```ts
const { container } = render(<Field label="Name" error="Enter a name.">{(props) => <Input {...props} />}</Field>)

await expectNoAxeViolations(container)
```

- **Covered:** every shared component and variant in `src/ui/`, the open confirmation dialog, the workspace layout, the sign-in page, and the resource and reservation screens with errors shown.
- **Keyboard and focus:** tests use `userEvent.tab()` and `userEvent.keyboard()`. For example, they check that the dialog keeps Tab inside, closes on Escape and returns focus, and that a failed submit focuses the first invalid field.
- **Not covered by axe in jsdom:** colour contrast, because jsdom doesn't render. The token pairs were checked by hand (see `styles/tokens.css`). The `region` rule is also off, because a component rendered alone isn't inside the page's landmarks.

An accessibility test must be able to fail. `src/test/axe.test.tsx` checks that the helper reports an unlabelled input.

#### In the browser

The smoke tests run the same axe-core in Chromium, where the page is rendered, so colour contrast is checked too. They cover the main screens in light and dark mode:

- registration with errors
- the calendar with a time being chosen
- moving a booking (light mode)
- the closure confirmation, the closures screen and the admin calendar
- the deactivation confirmation and the users screen
- a chosen dark theme on a light device
- both reservation lists
- the admin form with errors
- the confirmation dialog
- the weekly schedule

Other smoke tests use the keyboard alone: booking from the calendar, the confirmation dialog, and the unsaved-changes prompt.

TanStack Query notifies components on the next tick after a change. A test that checks rendered data straight after a change should check the cache with `queryClient.getQueryData`, or wait with `waitFor`.

## Frontend smoke tests

Playwright drives Chromium against the Vite dev server, with the API mocked using `page.route`. The mocks return the same RFC 9457 problem details as the real API. The tests cover:

- the admin flows
- the user booking flow
- the overlap error
- per-field validation errors
- the rate limit message
- session expiry: an expired or outdated stored session, a 401 during a session (without a loop), a failed login, and the token lifetime running out (using Playwright's clock)
- routing:
  - each screen's address surviving a reload
  - the back button
  - login returning to the page that was asked for, including after a session expires
  - logout
  - role redirects
  - the not-found page
- addresses that hold state:
  - admin reservation filters
  - booking links, including invalid ones and the back button
  - tabs remembering their selection
- cancelling a reservation freeing its time in the booking schedule (audit L2)
- moving a booking from My reservations to a new time in the calendar
- closing a resource, then seeing it closed as a user
- moving another user's booking from the admin calendar
- deactivating a user, who then gets the deactivated message at sign-in
- the saved theme applying before the app's JavaScript runs, and the theme switch

Because the API is mocked, these tests don't prove the frontend and backend work together. An end-to-end suite against the real stack is planned for Milestone 7.

## Code coverage

CI collects coverage from both backend suites. It publishes a summary on the run page and uploads the HTML report as the `backend-coverage-report` artifact. EF migrations are excluded.

To produce the same report locally:

```bash
dotnet tool restore
dotnet test ResourceReservationSystem.slnx --collect:"XPlat Code Coverage" --results-directory TestResults/coverage/raw
dotnet reportgenerator -reports:"TestResults/coverage/raw/**/coverage.cobertura.xml" -targetdir:TestResults/coverage/report -reporttypes:Html -assemblyfilters:"+ResourceReservation.Api" -classfilters:"-ResourceReservation.Api.Migrations.*"
```

Then open `TestResults/coverage/report/index.html`. Git ignores `TestResults/`.
