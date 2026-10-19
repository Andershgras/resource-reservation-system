# Testing

The project has four automated test suites, plus a smoke test and end-to-end tests of the running container stack. CI runs all of them on every push and pull request.

| Suite | Location | What it checks | Needs |
|---|---|---|---|
| Backend unit tests | `backend/ResourceReservation.Api.Tests` | Business rules in the services, and the CRUD controllers | .NET SDK |
| Backend integration tests | `backend/ResourceReservation.Api.IntegrationTests` | The whole API over HTTP against a real SQL Server | .NET SDK and Docker Desktop |
| Frontend unit tests | `frontend/resource-reservation-client/src/**/*.test.ts(x)` | Helpers, session handling, the API client, query hooks, routing, pages, and accessibility of the shared components | Node.js |
| Frontend smoke tests | `frontend/resource-reservation-client/tests/smoke` | The main browser flows in Playwright, with the API mocked | Node.js |
| Container stack smoke test | `deploy/smoke-test.sh` | The images and Docker Compose stack, checked from outside through nginx | Docker, `curl`, Node.js |
| End-to-end tests | `frontend/resource-reservation-client/e2e` | Whole journeys in a real browser against the real stack, with every email read from Mailpit | Docker, Node.js |

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

- **Service tests** (`ReservationServiceTests`, `AvailabilityServiceTests`, `BookingPolicyTests`) cover the business rules:
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
  - Registration and sign-in use `ExecuteUpdate` and transactions, which the in-memory provider can't run, so they are tested against SQL Server.
- **Calendar invitations** (`CalendarInviteTests`): Copenhagen times as UTC in winter and summer, both daylight-saving changes (the skipped spring hour and the repeated autumn hour, on the real 2030 dates), a booking across the autumn change lasting its real length, times in the skipped spring hour reported as never happening and refusing to convert, a booking across that hour allowed and one real hour long, REQUEST and CANCEL with the same UID and a rising SEQUENCE, escaping, line folding at 75 octets without splitting a character, and the email built around the invitation.
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
- **Registration (`RegistrationTests`):**
  - a new address gets an unconfirmed account and a link whose token is stored only as a hash, and can't sign in yet
  - an address with an account gets the same answer and a notice, and the account doesn't change, even when it is unconfirmed
  - ten parallel registrations of one address: one account, one link, at most one notice
  - email normalization, and the minimum response time for every request that may send email
- **Email verification (`EmailVerificationTests`):**
  - the link and the password confirm once
  - a wrong password neither confirms nor uses the link up, and counts towards the lockout
  - one link used ten times at once confirms once
  - expired and made-up links
  - a new link cancels the old one
  - the cooldown, even in parallel, and the same answer for every address
  - a correctly signed token for an unconfirmed account is still refused
- **Password reset (`PasswordResetTests`):**
  - a reset ends sessions, clears a lockout and sends a notice
  - one link used ten times at once resets once
  - expiry, and a link stopping when the account is deactivated
  - the same answer for every address, with the cooldown
  - an unconfirmed account set up again for the inbox owner, with the registrant's name, password and link gone
- **Account email logging (`AccountEmailLoggingTests`):** with every log level captured through the whole journey, no token, hash or link appears. A failed email is logged by kind and user only.
- **Booking emails (`BookingEmailTests`):**
  - making, moving and cancelling send invitations for one calendar event
  - an admin's change says so
  - a failing sender never undoes the booking, retries and then records the error, and a later attempt can succeed
  - a refused booking queues nothing
  - four concurrent workers send each of 20 emails once
  - deactivated users aren't emailed
- **Daylight saving (`DaylightSavingTests`):** on 31 March 2030, bookings starting or ending in 02:00–02:59 are refused, as are moves, closures (preview and save) and one-off windows; periods across the hour are accepted, and a booking 01:30–03:30 gets an invitation for 00:30–01:30 UTC.
- **Race tests fail without their protection.** Each was checked with its protection removed: using a link without the single-use condition, the cooldown, and the outbox claim condition.
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
- **Token checks (`TokenValidationTests`):** a failing check refuses the request instead of trusting the signature alone, a token for a missing user is rejected, and with every log level captured, neither the stamp nor its fingerprint appears in logs or error responses.
- **Security configuration:**
  - CORS for configured and unknown origins
  - forwarded headers trusted only from configured proxies
  - security headers and HSTS
  - rate limiting per client IP, including shared and spoofed addresses
  - health checks
  - expired tokens and the token endpoint's expiry fields
- **Cookie sessions and CSRF (`CookieSessionTests`, ADR 0012):** the tests run against `https://localhost`, so they use the production `__Host-` cookies.
  - the session and anti-forgery cookies' attributes, and no token in the sign-in response
  - restoring a session with `/me`, and the cookie authenticating requests
  - signing out revoking only that session, so a replayed copy of its cookie is refused while another device keeps working, also for bearer tokens
  - signing in again revoking the browser's previous session
  - failing closed: a revoked, expired, missing or another user's session, or a token without a session ID, is rejected
  - a security stamp change still ending cookie sessions
  - CSRF: no token, a forged token, a token from before signing in, sign-in without a token, cross-site `Sec-Fetch-Site` and foreign `Origin` values are all refused. A same-origin request is accepted.
  - only a bearer token that passed validation skips CSRF: a malformed or revoked one doesn't
  - `/token` needing no anti-forgery token and setting no cookie, but refused from another site
  - the relaxed Development cookies refused at startup in any other environment (`ConfigurationTests`)

Most other tests sign in through `/api/auth/token` and send a bearer token. Their anonymous requests use a browser-like client (`Infrastructure/BrowserClient.cs`), which keeps cookies and adds an anti-forgery token as the frontend does: one token shared by parallel requests, fetched again after signing in or out.
- **Startup configuration:** each kind of invalid setting stops the app with a message naming the setting.
- **Migrations:** they apply to an empty database and match the EF model. Users from before email verification come out confirmed, with no invented confirmation time, and existing reservations start at calendar sequence 0. `MigrationDataTests` upgrades a separate database holding data from before Milestone 6, and checks every row survives, with unknown audit times left empty and no booking rule overrides. A second test upgrades users from before PR 3. They stay active, each get their own stamp, and can sign in and use their token afterwards.

The shared test API allows bookings 3650 days ahead, because the test bookings are dated 2030. `BookingPolicyTests` checks the real default with its own API instance.

How the harness works (`Infrastructure/ApiFixture.cs`):

1. One container is started per test run and shared by every test class.
2. The real EF migrations are applied before the API starts.
3. Before each test, [Respawn](https://github.com/jbogard/Respawn) deletes all data and a test admin is seeded again.
4. Tests in the shared collection run one at a time, because they share the database.

### Email and clean-up

- **SMTP delivery (`SmtpDeliveryTests`):** `SmtpEmailSender` sends to a real Mailpit container, also started with Testcontainers. The email must arrive with its Message-ID, addresses, text and `.ics` invitation. STARTTLS to a server without TLS must fail, and nothing may arrive, so it never falls back to plain text.
- **SMTP settings (`SmtpEmailTests`, unit tests):** plain text is refused without `AllowInsecureConnection`, refused for a host that isn't local even with it, and refused with a password. The rules for which hosts count as local, the other SMTP settings, and the MIME message built for MailKit are covered too.
- **Startup (`ConfigurationTests`):** unencrypted SMTP outside a local test setup, missing SMTP settings and out-of-range retention settings stop the API.
- **Clean-up (`DataRetentionTests`, ADR 0013):** the clean-up runs against SQL Server, with the worker turned off.
  - sent and given-up booking emails deleted only after their periods, and unsent ones never
  - expired sessions after a week, and revoked ones only once expired
  - used or expired links after a week
  - an old unconfirmed account deleted with its links, cooldowns and sessions
  - unconfirmed accounts kept when they own or cancelled a reservation, created a closure, were deactivated, have a working link, are recent, are admins, or have no creation time
  - batches repeated until nothing is left, and a second run finding nothing
  - every foreign key to `Users` listed with its delete behaviour, so a new one fails the test until the clean-up is checked for it

### Running without Docker

Point the tests at any SQL Server you have, for example LocalDB:

```bash
INTEGRATION_TEST_CONNECTION_STRING="Server=(localdb)\MSSQLLocalDB;Database=ResourceReservation_IntegrationTests;Trusted_Connection=True;TrustServerCertificate=True" \
  dotnet test backend/ResourceReservation.Api.IntegrationTests
```

The tests delete all data in this database. To prevent accidents, the harness refuses any database whose name doesn't end in `_IntegrationTests`. `SmtpDeliveryTests` still needs Docker, for its Mailpit container.

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
- **Daylight saving in the calendar:** `isNonexistentWallClock` finds exactly 02:00–02:59 on the spring change and nothing in the autumn's repeated hour; the calendar never offers a start or end in the skipped hour; and the closure and window forms refuse such times beside the field.
- **Account pages** (`AccountPages.test.tsx`): the link token removed from the address at once and sent only with the form, the password asked for before confirming, refusals with a way to a new link, a missing token, the reset link checked before anything is typed, matching passwords, the name asked for when an unconfirmed account is set up again, the same answer for every address, the rate limit message, and axe on each page.
- **Theme** (`theme.test.tsx`): reading and saving the choice, storage being unavailable, the switch, and the two dark token blocks staying identical.
- **My reservations** (`MyReservationsPage.test.tsx`): when each booking was made, moved and cancelled, in Copenhagen time; which bookings offer Move; and cancelling with the version.
- **Admin resources** (`AdminResourcesPage.test.tsx`): the booking rules form, with its defaults, checks, API errors and unsaved changes.
- **The unsaved-changes guard** (`useUnsavedChangesGuard.test.tsx`): Stay, Discard, Escape, the back button, a quick Stay followed by another navigation, same-screen changes, reloads, logout and session expiry. `src/test/renderScreen.tsx` renders a screen in a data router with a signed-in user, as the app does.
- **`src/auth/authSession.ts`:** the in-memory session, using fake timers. Covered cases:
  - no token ever stored, only the signed-in hint
  - timing from `expiresInSeconds` on the device's clock
  - ending only the session of the right generation, and expiry
  - removing tokens stored by earlier versions, and remembering a sign-out that failed
- **`src/api/client.ts`:** with `fetch` stubbed. Covered cases:
  - headers and body, on the same origin and without an `Authorization` header
  - the anti-forgery token: only on unsafe requests, fetched once for parallel requests, fetched again after signing in or out, and retried once after `csrf_token_invalid`
  - problem-details messages
  - a 401 ending the session only when signed in, and never a newer session
- **`AuthProvider`:** restoring a session from `/api/auth/me`, saying it expired, finishing a sign-out that failed before restoring anything, signing out on the server, and clearing the query cache on login, logout and expiry.
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
- the forgotten password page, the new password page, and email confirmation with an error
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
- sessions: a session cookie restored, one that no longer works, a token stored by an earlier version removed and never sent, a 401 during a session (without a loop), a failed login, and the session lifetime running out (using Playwright's clock). The mocked API refuses every unsafe request without the anti-forgery token, as the real one does.
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
- registering, being refused until the email is confirmed, confirming through the emailed link (whose token leaves the address at once), then signing in
- resetting a forgotten password from the emailed link, and a used link saying so before anything is typed
- the saved theme applying before the app's JavaScript runs, and the theme switch

Because the API is mocked, these tests don't prove the frontend and backend work together. The [end-to-end tests](#end-to-end-tests) do.

## Container stack smoke test

`deploy/smoke-test.sh` checks a running Docker Compose stack with `curl`, through nginx, checking TLS against the local certificate rather than skipping the check. CI's **Container stack** job builds the three images, starts the stack with throwaway secrets, and runs it. To run it locally, start the stack ([deployment](deployment.md#quick-start-on-your-own-machine)), then:

```bash
sh deploy/smoke-test.sh
```

It checks:

- plain HTTP redirecting to `PUBLIC_ORIGIN`, keeping the path
- the security headers, and that the Content-Security-Policy's script hashes match the inline scripts in the served `index.html`
- `index.html` always revalidated, and hashed assets cached as immutable
- the SPA fallback for routes such as `/admin/users`, and a `404` for a missing asset
- `/health/ready` and `/api` reaching the API, which keeps its own `Cache-Control: no-store`
- with the seed admin set: signing in, and creating and deleting a resource, which checks that the API's SQL login can write. The new resource's `Location` header must start with `PUBLIC_ORIGIN`, which shows that the API trusts nginx's `X-Forwarded-Proto` and gets the original `Host`.
- with the seed admin set: a browser session over HTTPS with a cookie jar. It checks the `__Host-` cookie's attributes and that the sign-in response holds no token. Sign-in without an anti-forgery token, a forged token and a cross-site request must be refused. Signing out must revoke the session, so a copy of the cookie gets `401`.

It doesn't run a browser, so it can't see a CSP violation itself. When the stack was first built, a browser check against it found the hash mismatch caused by Windows line endings ([deployment](deployment.md#the-frontends-responses)). The end-to-end tests now check that in a real browser on every run.

## End-to-end tests

Playwright drives Chromium against the real stack: nginx, the API, SQL Server and Mailpit, with nothing mocked. They run in CI's **Container stack** job, after the smoke test. Locally, start the stack with Mailpit ([deployment](deployment.md#quick-start-on-your-own-machine)), then:

```bash
set -a; . ./.env; set +a          # the seed admin's credentials
cd frontend/resource-reservation-client
npm run test:e2e
```

They use `E2E_BASE_URL` (`https://localhost:8443` by default), `MAILPIT_URL` (`http://localhost:8025`) and the seed admin from `.env`, or `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD`.

- **A new user's journey (`booking-journey.spec.ts`):**
  1. Register in the browser, and fetch the verification email from Mailpit's API.
  2. Open its link, confirm with the password, and sign in.
  3. Book a time a week ahead, move it, then cancel it.
  4. Each of the three booking emails must arrive with its calendar invitation, and the cancelled time must be free again.
- **The session in a real browser (`session-security.spec.ts`):**
  - both cookies are `__Host-`, `HttpOnly`, `Secure` and `SameSite=Strict`, and `document.cookie` is empty
  - only the signed-in hint is in `localStorage`, and a reload restores the session
  - a form another site posts to the API is refused
  - signing out deletes the cookie, and a copy of it gets `401`
- **Both** fail on any console error or CSP violation.

The test data, a resource open every day, is created through `/api/auth/token`, and every name and address is unique, so the tests can run against a stack that already holds data.

**Rate limits:** the stack keeps the API's real per-IP rate limits. Each run registers one account and signs in a few times. Running the suite many times in a row soon gets `429`: registrations allow 5, then one every 3 minutes. Wait, or run `docker compose restart api`, because the counters are kept in memory.

## Code coverage

CI collects coverage from both backend suites. It publishes a summary on the run page and uploads the HTML report as the `backend-coverage-report` artifact. EF migrations are excluded.

To produce the same report locally:

```bash
dotnet tool restore
dotnet test ResourceReservationSystem.slnx --collect:"XPlat Code Coverage" --results-directory TestResults/coverage/raw
dotnet reportgenerator -reports:"TestResults/coverage/raw/**/coverage.cobertura.xml" -targetdir:TestResults/coverage/report -reporttypes:Html -assemblyfilters:"+ResourceReservation.Api" -classfilters:"-ResourceReservation.Api.Migrations.*"
```

Then open `TestResults/coverage/report/index.html`. Git ignores `TestResults/`.
