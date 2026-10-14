# Resource Reservation System - Roadmap

This roadmap describes how the project should continue after the backend and frontend MVPs.

The goal is to keep development focused, portfolio-friendly, and easy to explain through small GitHub issues and commits.

## MVP Completed

The first backend MVP is implemented.

Completed backend areas:

- User registration and login
- JWT authentication
- Role-based authorization for Admin and User
- Resource management
- Availability management
- Reservation creation and cancellation
- Reservation overlap prevention
- DTO-based API contracts
- Swagger documentation support

The first frontend MVP is implemented.

Completed frontend areas:

- Login and registration UI
- JWT session storage
- Role-based Admin and User views
- Simple navigation between role workflow screens
- Resource listing
- Admin resource management
- Availability listing
- Admin availability management
- User reservation creation
- User reservation listing and cancellation
- Admin reservation listing and cancellation

## Recommended GitHub Issue Workflow

Use GitHub Issues as small User Stories.

Each issue should describe one clear improvement and include acceptance criteria.

Suggested format:

```text
As a [role],
I want [goal],
so that [reason].
```

Each issue should include:

- A short user story
- Acceptance criteria
- Verification steps
- A focused branch name
- One focused commit or pull request

Keep each issue small enough that it can be implemented, verified, and committed independently.

## Completed User Stories

These GitHub issues are closed and implemented:

- Active overlapping reservations are rejected
- Cancelled reservations do not block new reservations
- Reservations must stay inside an availability window
- `dotnet test` passes

### Add Frontend Validation For Availability Forms

As an admin, I want clear validation before submitting availability, so that I can fix input mistakes before the API rejects the request.

Acceptance criteria:

- Resource selection is required
- Start time is required
- End time is required
- End time must be after start time
- `npm run build` passes

### Improve Frontend Feedback States

As a user, I want consistent loading, empty, success, and error messages, so that the app is easier to understand.

Acceptance criteria:

- Resource, availability, and reservation sections use consistent feedback patterns
- API errors are shown clearly
- Empty states are understandable
- `npm run build` passes

### Add Demo Seed Data

As a reviewer, I want the app to have simple demo data, so that the project can be tested quickly.

Acceptance criteria:

- Development seed data creates example resources
- Development seed data creates example availability
- Seed data does not replace real user-created data unexpectedly
- Backend build passes

### Add README Screenshots

As a portfolio viewer, I want screenshots of the app, so that I can quickly understand what the project does.

Acceptance criteria:

- README includes at least one Admin screenshot
- README includes at least one User screenshot
- Screenshots match the current MVP UI
- README remains concise

### Add Weekly Availability Rules

As an admin, I want to define weekly availability for a resource, so that resources can follow real opening hours instead of only one-off date ranges.

Acceptance criteria:

- Admins can create, edit, and delete weekly availability rules
- Weekly rules store resource, weekday, start time, and end time
- Overlapping rules for the same resource and weekday are rejected
- Reservations can be created inside a matching weekly rule
- Reservations outside a matching weekly rule are rejected
- Existing one-off availability windows still work
- `dotnet test ResourceReservationSystem.slnx` passes

### Generate Bookable Resource Schedule

As a user, I want to view generated bookable time for a selected resource and date range, so that the booking flow can show real available intervals instead of raw availability records.

Acceptance criteria:

- A resource schedule endpoint accepts a from date and to date
- Weekly availability rules generate concrete bookable intervals
- Existing one-off availability windows are included
- Active reservations are subtracted from bookable intervals
- Cancelled reservations do not block bookable intervals
- The response includes reserved slots without exposing user details
- `dotnet test ResourceReservationSystem.slnx` passes

### Add Admin Weekly Schedule UI

As an admin, I want to manage weekly resource schedules in the frontend, so that I can set practical opening hours like Monday to Friday from 08:00 to 16:00.

Acceptance criteria:

- Admins can view a weekly schedule screen
- Admins can create weekly schedule rules for a resource and weekday
- Admins can edit weekly schedule times
- Admins can delete weekly schedule rules after confirmation
- Client-side validation catches missing resource, weekday, start time, end time, and invalid time order
- `npm run lint` passes
- `npm run build` passes
- `npm run test:smoke` passes

### Create Resource-First Booking Flow

As a user, I want to choose a resource before selecting a reservation time, so that booking follows the real-world flow of finding a resource and then picking an available time.

Acceptance criteria:

- User navigation starts with a resource booking screen
- Users can choose an active resource and date range
- The frontend loads generated bookable slots for the selected resource
- Users can select a time inside a bookable slot
- Creating a reservation refreshes the user's reservations and resource schedule
- Existing reservation validation and overlap errors are still shown clearly
- `npm run lint` passes
- `npm run build` passes
- `npm run test:smoke` passes

### Polish Calendar Availability View

As a user, I want bookable times grouped by day, so that I can scan a selected resource's schedule like a practical calendar instead of reading a flat list of availability records.

Acceptance criteria:

- Bookable slots are grouped by schedule day
- Each day shows open slot counts
- Reserved times are shown for context
- The user booking flow no longer exposes the raw availability tab
- The schedule remains usable on mobile and desktop layouts
- `npm run lint` passes
- `npm run build` passes
- `npm run test:smoke` passes

## Production Readiness Roadmap

After the MVP, the project was audited. The full findings are in [audit/2026-10-initial-audit.md](audit/2026-10-initial-audit.md), and finding IDs such as H1 and M2 refer to that document.

Work continues in milestones. Each milestone is made of small changes that are verified independently. A milestone starts only after the previous one has been reviewed and approved.

| Milestone | Focus | Status |
|---|---|---|
| M1 | Booking correctness and data integrity | Done ([#52](https://github.com/Andershgras/resource-reservation-system/pull/52)) |
| M2 | Backend structure (service layer, ProblemDetails, options validation) and integration tests on real SQL Server | Done ([#53](https://github.com/Andershgras/resource-reservation-system/pull/53)) |
| M3 | Security and production configuration (CORS, rate limiting, health checks, session expiry handling) | Done ([#54](https://github.com/Andershgras/resource-reservation-system/pull/54)) |
| M4 | Frontend architecture (routing, splitting `App.tsx` state into feature hooks, unit tests) | Done ([#55](https://github.com/Andershgras/resource-reservation-system/pull/55)) |
| M5 | UI/UX modernisation (design system, week calendar, accessibility) | Done ([#56](https://github.com/Andershgras/resource-reservation-system/pull/56), [#57](https://github.com/Andershgras/resource-reservation-system/pull/57)) |
| M6 | Real-world features (audit fields, booking policies, rescheduling, availability exceptions, user management, email flows) | Done ([#58](https://github.com/Andershgras/resource-reservation-system/pull/58), [#60](https://github.com/Andershgras/resource-reservation-system/pull/60), [#61](https://github.com/Andershgras/resource-reservation-system/pull/61), [#62](https://github.com/Andershgras/resource-reservation-system/pull/62)) |
| M7 | Deployment (Docker Compose, published images, end-to-end tests against the real stack, httpOnly cookie authentication). Deploy-ready, with no hosted demo. | In progress: PR 1 awaiting review |

### M1: Booking Correctness And Data Integrity

- [x] Booking validation and the generated schedule share one availability calculation (H2)
- [x] Reservations must start in the future, and schedules hide past time, using the `Europe/Copenhagen` time zone (H3, M5)
- [x] The schedule date range is limited (H4)
- [x] Concurrent overlapping bookings are prevented, and conflicts return 409 (H1, L5)
- [x] Schema hardening: unique email, column lengths, overlap index, restrictive deletes, existing data preserved (M2)
- [x] README, decision records and roadmap updated

### M2: Backend Structure And Test Coverage

Agreed decisions:
- Errors use the standard ProblemDetails format (RFC 9457) instead of `{ message, errors }`. Frontend error and validation messages must keep working.
- Integration tests run against real SQL Server using Testcontainers. Locally this needs Docker Desktop; in CI, GitHub Actions provides Docker.
- A booking-lock timeout returns `503 Service Unavailable` with a `Retry-After` header and a user-friendly message. `409 Conflict` remains reserved for genuine booking overlaps.

Planned changes, in order. The service layer was moved ahead of ProblemDetails so that the error format changes in one place:

- [x] Integration test harness: `WebApplicationFactory` with Testcontainers SQL Server, plus baseline tests for authorization, validation, booking concurrency, the unique email, and migrations (M8 in the audit)
- [x] Configuration validated at startup using the Options pattern (Jwt, Scheduling, SeedAdmin, connection string)
- [x] Service layer: reservation, auth and schedule logic moves out of the controllers, including the per-resource booking lock ([ADR 0002](adr/0002-reservation-concurrency.md))
- [x] A booking-lock timeout returns 503 with `Retry-After`. It previously surfaced as an unhandled 500.
- [x] ProblemDetails for every error, plus a global exception handler (M1 in the audit), with the frontend client updated to match
- [x] Code coverage reported in CI, plus `docs/testing.md`, `docs/architecture.md` and ADR 0003

Follow-ups noticed during M2, outside its scope:

- Validation messages for missing or malformed fields use DataAnnotations' default wording, such as "The field Password must be a string or array type with a minimum length of '8'." Add friendly `ErrorMessage` values to the request DTOs (M5, UI/UX).
- [x] `Location` headers and generated links use the controller's casing (`/api/Reservations/1`). Done in M3: URLs are now lowercase.
- [x] The unused `Microsoft.AspNetCore.OpenApi` package (audit L12) generates code. Done in M3: the package is removed.

### M3: Security And Production Configuration

Agreed decisions:
- The JWT stays in `localStorage` for now, with proper session-expiry handling. API security headers don't protect the frontend's JavaScript from XSS. **Before any public deployment (M7), review moving to httpOnly cookie authentication.**
- Login and register allow 10 requests per minute per client IP by default. `Retry-After` is based on the real retry time, as far as the rate limiter can report it.
- Database migrations run as a separate deployment step from an EF migration bundle, never automatically when the API starts.
- Registration should not reveal whether an email is already registered, but must not show a misleading success message either. If this can't be done cleanly without email verification, the limitation is documented and an interim approach is proposed before the API contract changes.
- Forwarded headers are trusted only from explicitly configured proxies.

Planned changes, in order:

- [x] Tidy-ups: remove the unused OpenApi package (L12), lowercase URLs, roadmap update
- [x] CORS origins from configuration, validated at startup
- [x] Forwarded headers from configured proxies, HSTS and security headers
- [x] Rate limiting on login and register, returning 429 with `Retry-After` (M4 in the audit)
- [x] Health check endpoints for liveness and readiness
- [x] Session expiry: the login response includes `expiresAt` and `expiresInSeconds`, and the frontend logs out on expiry or 401 (M3 in the audit)
- [x] Migration bundle built and tested in CI, plus a deployment guide ([ADR 0005](adr/0005-migrations-in-deployment.md))
- [x] Security and configuration documentation, plus [ADR 0004](adr/0004-token-storage-and-session-expiry.md)

Implementation notes:
- Rate limiting uses ASP.NET Core's token bucket:
  - Each client gets a burst of 10 attempts, then one more every 6 seconds, up to 10.
  - The built-in limiters can't report the time left until the next attempt. The token bucket's `Retry-After` is the 6-second refill interval, which is much closer to the real wait than a fixed window's 60 seconds.
  - Exact behaviour, as measured, is in [security](security.md#brute-force-protection).
- The EF tools and migration bundle use a design-time `DbContext` factory, so they no longer start the API.

- [x] Login timing: unknown emails also verify a password hash, so login no longer reveals existing accounts through a large timing difference. This narrows the gap but isn't constant-time ([security](security.md#login-timing)).

Registration still reveals whether an email is already registered. A generic response isn't possible without email verification, so the registration response stays as it is until M6 (approved). See [security](security.md#account-enumeration).

Follow-ups for later milestones:

- Email verification, which allows a generic registration response (M6)
- Account lockout per user (M6)
- Re-hash passwords on login when the hasher reports `SuccessRehashNeeded`

### M4: Frontend Architecture

The frontend's behaviour stays the same, except where noted below.

Agreed decisions:
- Server data uses TanStack Query, with one set of hooks per feature. Saving something refreshes the lists it affects, and logout clears the cache.
- Routing uses React Router 7 in declarative mode, with real URLs, browser history and protected routes. (React Router 8 needs Node 22.22 or later, so 7 is used.)
- The booking screen keeps its resource and date range in the URL, such as `/book?resource=3&from=2030-01-14&to=2030-01-20`. Invalid parameters are ignored rather than breaking the page.
- Audit L2 is fixed: cancelling a reservation refreshes the booking schedule, with a regression test.

Planned changes, in order:

- [x] Vitest and React Testing Library, with the pure helpers moved from `App.tsx` to `src/lib/` and unit tested
- [x] React Router: each screen has its own URL
- [x] `AuthProvider`: login and register routes, protected routes with `returnTo`, and the session-expiry redirect
- [x] TanStack Query feature hooks, one feature at a time, with form state moved out of `App.tsx` (fixes L2)
- [x] Confirmation dialog provider; `App.tsx` reduced to providers and routes
- [x] Booking selection kept in the URL, with validated parameters
- [x] Docs: ADR 0006, architecture, testing and README

Changes in behaviour:
- Fixed: cancelling a reservation now refreshes the booking schedule (L2).
- New: each screen has an address, and the back button and reloads work. Admin reservation filters and the booking selection are kept in the address.
- New: login returns to the page that was asked for.
- New: unknown addresses show a not-found page.
- Changed: a resource change refreshes every list that shows resource names, not only resources and weekly rules.
- Changed: a half-filled form is lost when switching tabs, because each screen is its own route. Filters and the booking selection are kept.

Follow-ups noticed during M4:
- `npm audit` reports advisories in `brace-expansion` (through ESLint) and `source-map-js` (through Vite, jsdom and the coverage tool). Both packages are build tooling only, and both were already on `main` before M4. Fixed on 14 October 2026 by a separate lockfile-only pull request. See [security](security.md#dependency-advisories) for the advisories, exploit conditions and fix.
- Unsaved form drafts are lost when switching screens. This is tracked for M5, below.
- The development machine runs Node 22.19. React Router 8 and jsdom 30 need Node 22.22 or later, and upgrading Node would allow both.

### M5: UI/UX Modernisation

Agreed decisions:
- Plain CSS with design tokens and a stylesheet next to each component. No CSS framework or CSS-in-JS.
- React Router's data router (`createBrowserRouter`), so leaving a form with unsaved changes can be blocked. Data still loads through TanStack Query, not route loaders.
- Booking start and end times are chosen in 15-minute steps.
- Dates and times are shown in `en-GB` format with a 24-hour clock. Times stay wall-clock times in `Europe/Copenhagen` ([ADR 0001](adr/0001-time-zone-convention.md)), whatever the viewer's own time zone.
- The anonymous schedule no longer returns `reservationId`.
- Reservation responses, which only the owner or an admin can read, include `userName` and `userEmail`.
- The milestone is delivered as two pull requests that can be reviewed on their own.

PR 1: foundation

- [x] Backend: remove `reservationId` from the schedule (audit L10), and add `userName` and `userEmail` to reservation responses (audit L1)
- [x] Backend: friendly validation messages on the request DTOs (from M2)
- [x] Date and time formatting in `en-GB`, 24-hour, independent of the browser's time zone
- [x] Design tokens and CSS structure, keeping light and dark mode
- [x] Shared UI components, with accessibility tests
- [x] API validation errors shown beside their fields
- [x] Accessible confirmation dialog, with accessibility and keyboard tests
- [x] Screens moved to the shared components and the new layout
- [x] Docs: [ADR 0007](adr/0007-design-system.md), architecture, testing, security and README

Changes in behaviour in PR 1:
- Changed: the schedule's reserved slots no longer include `reservationId`. Reservation responses gain `userName` and `userEmail`.
- Changed: validation messages from the API are written for people, such as "Enter a resource name.", and are shown beside their fields. A field with several messages shows the first.
- Changed: every form checks all its fields before sending and reports them together, instead of relying on the browser's bubbles.
- Changed: dates read "Tue 15 Jan 2030, 09:00" everywhere, whatever the browser's language or time zone. The booking screen's default range starts on today's date in Copenhagen.
- Changed: the confirmation dialog is an alert dialog with focus handling, and stays open with the error if its action fails.
- Changed: the sign-in page's Login and Register switch is a pair of links, because it changes the address.
- New: a skip link, a document title per screen, and buttons named after their row, such as "Delete Room A".
- New: `axe-core` (development only) checks the shared components, the dialog, the layout and the main forms.

PR 2: booking calendar and navigation

- [x] Data router (`createBrowserRouter`), with ADR 0006 amended
- [x] Unsaved-changes guard on forms, which never blocks automatic session expiry
- [x] Weekly booking calendar: available and reserved periods, fully booked days still shown (audit L3), start and end chosen inside an available interval, works on desktop and mobile
- [x] Remaining accessibility and keyboard tests, including daylight-saving transitions and slot boundaries in the calendar, and axe with colour contrast in the browser
- [x] Screenshots and documentation

Changes in behaviour in PR 2:
- New: the booking screen is a weekly calendar. A start and end are chosen in 15-minute steps, plus the free period's exact edges.
- Changed: fully booked days stay visible (audit L3). Days without opening hours and past days are marked.
- Changed: the booking address is `/book?resource=3&week=2030-01-14`. Older links with `from` and `to` open the week of their `from` date.
- New: leaving a form with unsaved changes asks first. Reloading or closing the tab gets the browser's prompt. Logging out and session expiry are never blocked.
- Changed: a booking that clashes with one made meanwhile reloads the calendar.
- Changed: the JavaScript bundle grew by about 17 kB gzipped, for the data router.

Follow-ups carried over from earlier milestones, and where they are handled:

- **Unsaved form drafts (from M4):** done in PR 2. Leaving a form with unsaved changes asks first. Drafts stay local to their page, with no shared global state.
- **Friendly validation messages on the request DTOs (from M2):** done in PR 1.
- **User names instead of IDs for admins (audit L1):** done in PR 1.
- **Fully booked days in the schedule (audit L3):** done in PR 2.
- **Identical ternary branches in the booking section (audit L4):** done in PR 1, while restyling the booking section.

### M6: Real-World Features

Agreed decisions:
- Four pull requests, each reviewed and merged before the next one starts.
- Booking rules have configurable defaults: bookings last 15 minutes to 8 hours, need no notice, can be made up to 90 days ahead, and each user can hold 5 upcoming bookings.
- Each resource can override the duration, notice and horizon rules with nullable values, where null means the resource uses the default.
- The same rules apply to admins, with no implicit exemptions.
- Per-user and per-resource application locks, always taken in the same order.
- Bookings can only be moved to another time on the same resource, for now.
- Audit times are stored in UTC as `datetimeoffset`. Unknown historical times stay null rather than being invented.
- Deactivating a user keeps their reservations.
- Email works through an `IEmailSender` abstraction with a development-only sender. A real provider is configured in M7.
- A Light/Dark/System theme switch, saved in the browser. Dates stay in `en-GB`, and full localisation is deferred.
- Resource categories and advanced reservation-history filters are deferred.

PR 1: reservation lifecycle ([ADR 0008](adr/0008-booking-policies-and-reservation-changes.md))

- [x] Audit fields on reservations: created, updated, cancelled, and who cancelled (audit L7). Existing rows keep their data, with unknown times left empty.
- [x] Booking rules with defaults from configuration, per-resource overrides, and a check constraint
- [x] A cap on upcoming bookings per user, kept under a per-user lock taken before the resource lock
- [x] Moving a booking, with the same checks as a new one, and the schedule leaving out the booking being moved
- [x] `rowversion` on reservations. Moves and cancellations based on an out-of-date copy return a consistent 409.
- [x] Development demo data gets weekday opening hours, because its 2030 windows are past the 90-day horizon. A resource that already has weekly rules keeps them.
- [x] Frontend: the calendar follows the rules, users move bookings in the calendar, the lists show each booking's history, and admins set a resource's rules
- [x] Tests:
  - a migration test with existing data
  - concurrent bookings, moves and cancellations against SQL Server
  - startup validation of the rules
  - unit, page and smoke tests, with axe on the move screen
- [x] Docs: ADR 0008, updates to ADRs 0001 and 0002, README, architecture, configuration, security and testing

Changes in behaviour in PR 1:
- New: bookings must be 15 minutes to 8 hours long and end within 90 days. Each user can hold at most 5 upcoming bookings. Existing bookings aren't re-checked.
- New: the schedule only offers time the rules allow, leaves out free periods shorter than the shortest booking, and returns the rules as `policy`. The calendar offers only allowed start and end times, and describes the rules.
- New: `PUT /api/reservations/{id}` moves a booking. Users move their own upcoming bookings from My reservations, in the booking calendar.
- New: reservation responses include `createdAt`, `updatedAt`, `cancelledAt`, `cancelledByUserId`, `cancelledByName` and `version`. Both reservation lists show them.
- New: `GET /api/bookingpolicy` returns the defaults. Resources gain four optional booking rule fields.
- Changed: cancelling accepts an optional `{ version }` body. The frontend sends it, and reloads its lists after a failed cancel too.
- Changed: 409 now also means "changed by someone else". The calendar reloads for either kind.
- Changed: in Development, the demo resources open Monday to Friday (Meeting Room A 08:00–16:00, Projector 09:00–15:00), unless they already have weekly rules.

Follow-ups noticed during PR 1:
- Admins can move any booking through the API, but not yet in the browser, because `/book` is for users. The admin calendar in PR 2 adds it.
- Changing a default in configuration can make an existing resource override contradict it, such as a minimum longer than a lowered maximum. Such a resource offers no time and says why when booked, until an admin fixes the override ([ADR 0008](adr/0008-booking-policies-and-reservation-changes.md)).

PR 2: availability exceptions and the admin calendar ([ADR 0009](adr/0009-availability-exceptions.md))

- [x] Closures for holidays and maintenance, taken out of the shared availability calculation so the calendar and booking checks can't disagree. Overlapping closures are combined but kept as separate records with their reasons. There are no recurring closures yet.
- [x] Before a closure is confirmed, admins see which existing reservations it affects. Creation takes the resource's booking lock, and bookings check availability under it, so the final list is complete. Reservations are never cancelled automatically.
- [x] A weekly calendar for admins, built on the booking calendar, showing bookings with user names, including moving a booking
- [x] Calendars refresh when the window regains focus, and every 60 seconds while visible
- [x] Light/Dark/System theme switch, saved in the browser, keeping system theme support, with no flash on load
- [x] Tests:
  - closure boundaries and both daylight-saving changes
  - concurrency between closures and bookings, shown to fail without the lock
  - the admin-only owner details
  - the freshness, theme, screen and smoke tests, with axe
- [x] Docs: ADR 0009, updates to ADRs 0002, 0006 and 0007, README, architecture, security and testing

Changes in behaviour in PR 2:
- New: `/admin/closures`, `/admin/calendar` and the `availabilityexceptions` endpoints. The schedule gains `closedSlots`.
- New: a Theme menu in the header.
- Changed: booking and moving check availability after taking the booking lock.
- Changed: calendars reload on focus and every minute while visible.
- Changed: the section tabs always have their own header row, so all six admin tabs fit.
- Changed: `GET /api/reservations/resource/{id}` accepts optional `from` and `to` dates.

Follow-ups noticed during PR 2:
- Editing one-off windows and weekly rules still doesn't report affected bookings, unlike closures ([ADR 0009](adr/0009-availability-exceptions.md)).
- `index.html` has a small inline script for the theme, which a strict Content-Security-Policy in M7 must allow by hash.

PR 3: user management and account security ([ADR 0010](adr/0010-user-management-and-account-security.md))

Agreed decisions:
- Five failed sign-ins lock an account for 15 minutes.
- Admins can't demote or deactivate themselves.
- Deactivated users keep their reservations.
- The last-active-admin check runs under a SQL Server application lock, on every path that changes a role or status.
- Deactivated accounts never get a token, and deactivation is only revealed after the right password.
- Concurrent sign-ins can't get around a lockout or corrupt the failure count. Re-hashing can't overwrite a newer password.
- Security stamps are random, never returned by the API, and checked against the database on every authenticated request.

- [x] Admin user list with search and pages, role changes and deactivation
- [x] The last active admin can't be removed or deactivated, even by concurrent requests: changes are serialized by a lock, and the acting admin is re-checked under it
- [x] Role changes and deactivation take effect on existing tokens immediately, through a security stamp checked on every request
- [x] Temporary per-account lockout that doesn't reveal whether an account exists, with one atomic failure count and the same answer and timing for every failure
- [x] Re-hash passwords on login when the hasher asks for it (from M3), without overwriting a newer password
- [x] Tests:
  - a migration test with existing users, who stay active and can sign in
  - SQL Server tests of lockout, enumeration resistance, races during sign-in, re-hashing, token revocation and concurrent admin changes, each race shown to fail without its protection
  - unit, page and smoke tests, with axe on the Users screen in both themes
- [x] Docs: ADR 0010, updates to ADRs 0002 and 0004, README, architecture, configuration, security and testing

Changes in behaviour in PR 3:
- New: `/admin/users` and the `/api/users` endpoints.
- New: five failed sign-ins lock an account for 15 minutes. A deactivated account gets `403` after the right password.
- Changed: every failed sign-in returns "Invalid email or password. After repeated failed attempts, sign-in pauses for a few minutes."
- Changed: every authenticated request checks its user in the database. Tokens issued before this change have no security stamp, so everyone signs in once more.
- Changed: `BookingLocks` is now `ApplicationLocks`.
- Changed: sign-in tests moved from the in-memory unit tests to SQL Server integration tests.

Follow-ups noticed during PR 3:
- Admins can't unlock a locked account by hand. A lockout ends by itself after 15 minutes.
- Lockout can be used to keep a known user out, 15 minutes at a time. The rate limit slows this ([security](security.md#known-limitations)).

PR 4: email flows ([ADR 0011](adr/0011-email-flows.md))

Agreed decisions:
- New accounts verify their email before signing in. Unverified accounts never get a token and can't book.
- Booking emails for new, moved and cancelled bookings.
- Verification links last 24 hours, reset links 1 hour, and each account gets at most one email of each kind every 2 minutes.
- Booking emails go through a database outbox written with the booking, sent by a background worker with bounded retries and recorded failures. Link emails use a bounded in-memory queue, so raw tokens are never stored. No external message broker.
- A development email sender only. A real provider is configured in M7.
- Resetting an unverified account must not hand an attacker's data to the address's owner.

- [x] `IEmailSender` with a development sender that writes `.eml` files, and a capturing sender in tests
- [x] Email verification, which allows a generic registration response (from M3). Confirming needs the link and the account's password.
- [x] Password reset that ends existing sessions, and sets up an unconfirmed account again for the inbox owner
- [x] Tokens that are random, expiring and single use, stored only as hashes, kept in the URL fragment and removed from the address, and never written to normal logs
- [x] The same answer and a minimum response time for every request that may send email, a per-account cooldown and a per-IP email rate limit
- [x] Booking confirmation, move and cancellation emails through an outbox, with an `.ics` invitation that updates one calendar event
- [x] Tests:
  - SQL Server tests of registration, verification, reset, concurrent use of one link, the cooldown, logging, the outbox and its concurrent workers, and the migration with existing users
  - unit tests of the invitations, including both daylight-saving changes
  - page tests with axe, and smoke tests of the new flows
- [x] Docs: ADR 0011, README, architecture, configuration, deployment, security and testing

Changes in behaviour in PR 4:
- Changed: `POST /api/auth/register` returns `202 { message }`, the same for every address, instead of `201` with the user.
- New: unconfirmed accounts get `403` after the right password, until confirmed. Existing accounts are confirmed by the migration.
- New: `/verify-email`, `/forgot-password`, `/reset-password` and `/resend-verification`, and the API endpoints behind them.
- New: booking emails with calendar invitations.
- New: registration, resend-verification and forgot-password have their own per-IP rate limit, and answer no sooner than 250 ms.
- New: the API needs `Email:Delivery`, `Email:FromAddress` and `Frontend:BaseUrl` to start. Development sets them.
- Changed: the Users screen marks unconfirmed accounts, which can't be made admins.
- Changed: bookings, moves, closures and one-off windows can't start or end in the hour skipped when summer time starts (02:00–02:59 on the last Sunday of March). The calendar no longer offers those times ([ADR 0001](adr/0001-time-zone-convention.md#updates)).
- Note: booking emails are delivered at least once, not exactly once.

Follow-ups noticed during PR 4:
- Sent booking emails stay in the outbox table. A clean-up job belongs with the deployment work (M7).
- Unconfirmed accounts that are never confirmed stay in the database. They can't sign in, and a later registration or reset of the address deals with them, but nothing removes them.
- Editing one-off windows and weekly rules still sends no email to affected bookings, as before.

### M7: Deployment

Agreed decisions (14 October 2026):
- M6 PR 3 and PR 4 are finished before M7 starts.
- M7 ends at "deploy-ready": images published to the GitHub container registry and a documented Docker Compose deployment, with no live host or cloud accounts.
- Three pull requests, each reviewed before the next one starts.
- Session cookies replace `localStorage`: an httpOnly cookie, with robust CSRF protection rather than only a custom header.
- `__Host-` cookies need HTTPS, so the stack serves HTTPS on your own machine too.
- The API trusts forwarded headers only from explicitly configured reverse proxies.
- SQL Server, and the mail catcher in PR 3, are never exposed in production. Mailpit is for local development only.
- SMTP through MailKit.
- Images on GHCR are public, and are published only after CI passes, by a job with minimal permissions.
- Secrets stay out of images and git.

PR 1: containers and Docker Compose ([deployment](deployment.md))

- [x] API image: multi-stage build, non-root user, no development settings or secrets
- [x] Migrator image: the existing migration bundle, run once before the API starts
- [x] Frontend image: nginx, non-root, serving the built app with `/api` on the same origin
- [x] `compose.yaml`: SQL Server with a volume, then the migrator, then the API's least-privilege SQL login, then the API (checked with `/health/ready`), then nginx. Only nginx publishes ports, on `127.0.0.1` by default.
- [x] HTTPS at nginx, with a script for a local certificate. Plain HTTP only redirects.
- [x] The API trusts only nginx's fixed address as its proxy (from M3)
- [x] Content-Security-Policy and other security headers for the frontend's pages, with the inline theme script allowed by a hash computed at build time (from M6 PR 2)
- [x] SPA fallback, so routes such as `/admin/users` work on reload, and a 404 for missing assets
- [x] Hashed assets cached as immutable, `index.html` always revalidated
- [x] Secrets in `.env`, which git ignores, with `.env.example` committed
- [x] CI builds the images, starts the stack and runs `deploy/smoke-test.sh`. The workflow's token is read-only.
- [x] Docs: deployment guide, README quick start, configuration, security, testing, architecture, an update to ADR 0005, and this roadmap

Changes in behaviour in PR 1:
- New: `docker compose up` runs the whole system at `https://localhost:8443`.
- Changed: the API logs SQL commands only at warning level, so the outbox worker no longer writes a log entry every 5 seconds.

Verified locally: the stack starts from empty volumes, and the smoke test passes. A browser check found no CSP violations: the saved theme applied, sign-in worked, and `/admin/users` reloaded. A full flow through nginx succeeded: register, confirm with the emailed link, sign in, book, and the booking email with its invitation. Forwarded headers sent from another container were ignored, nginx found the API again after it restarted, and the nginx image refused to start without its settings.

Follow-ups noticed during PR 1:
- ASP.NET Core's Data Protection keys are kept in memory. Nothing uses them yet, but PR 2's cookie and anti-forgery protection will, so PR 2 stores them in a volume.
- A load balancer in front of nginx isn't supported out of the box ([deployment](deployment.md#https)).

PR 2: httpOnly cookie authentication (ADR 0012, replacing ADR 0004)

- [ ] **Security review before any public deployment:** move the JWT from `localStorage` to an httpOnly cookie ([ADR 0004](adr/0004-token-storage-and-session-expiry.md))
- [ ] CSRF protection for every request that changes something
- [ ] Server-side sign-out, and `GET /api/auth/me` to restore a session on load
- [ ] Bearer tokens kept for clients other than browsers

PR 3: real email, end-to-end tests and published images

- [ ] SMTP delivery through MailKit
- [ ] Mailpit in compose, for local development only
- [ ] Playwright end-to-end tests against the full stack in compose
- [ ] Images published to GHCR after CI passes, tagged with the commit SHA and `latest`
- [ ] Clean-up of sent booking emails and of accounts that were never confirmed (from M6 PR 4)

## Later Ideas

Availability exceptions are done in M6 PR 2. Email notifications with calendar invitations are done in M6 PR 4.

Deferred, with no milestone yet:

- Resource categories
- Advanced reservation history filters
- Full localisation, beyond the fixed `en-GB` format
- Moving a booking to another resource
- Recurring closures, such as every 24 December
