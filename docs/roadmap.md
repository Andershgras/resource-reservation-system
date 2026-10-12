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
| M4 | Frontend architecture (routing, splitting `App.tsx` state into feature hooks, unit tests) | Done, awaiting review |
| M5 | UI/UX modernisation (design system, week calendar, accessibility) | Not started |
| M6 | Real-world features (audit fields, booking policies, rescheduling, availability exceptions, user management) | Not started |
| M7 | Deployment (Docker Compose, continuous deployment, end-to-end tests against the real stack, auth cookie security review) | Not started |

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
- `npm audit` reports advisories in `brace-expansion` (through ESLint) and `source-map-js` (through Vite, jsdom and the coverage tool). Both packages are build tooling only, and both were already on `main` before M4. A separate lockfile-only fix is recommended from 14 October 2026. See [security](security.md#dependency-advisories) for the advisories, exploit conditions and fix.
- Unsaved form drafts are lost when switching screens. This is tracked for M5, below.
- The development machine runs Node 22.19. React Router 8 and jsdom 30 need Node 22.22 or later, and upgrading Node would allow both.

### M5: UI/UX Modernisation

Not started. Follow-ups carried over from earlier milestones:

- **Unsaved form drafts (from M4).** Since M4, each screen is its own route, so a half-filled form is lost when the user switches tabs. Address this in the UI, not with shared global state. For example:
  - warn before leaving a form with unsaved changes
  - make create and edit forms smaller steps, such as an edit dialog on the list screen, so less is typed before saving

  Keep drafts local to their page. Filters and the booking selection already survive in the address.
- Friendly validation messages on the request DTOs (from M2).
- Show user names, not IDs, to admins (audit L1).
- Show fully booked days in the schedule (audit L3). A unit test pins the current behaviour, so the change is deliberate.
- Remove the identical ternary branches in the booking section (audit L4).

### M7: Deployment

Tracked so far:

- [ ] **Security review before any public deployment:** move the JWT from `localStorage` to an httpOnly cookie, or document why not ([ADR 0004](adr/0004-token-storage-and-session-expiry.md))
- [ ] Content-Security-Policy and other security headers for the frontend's pages, set by whatever serves them
- [ ] Run the migration bundle as a deployment step, and configure the reverse proxy as trusted
- [ ] Serve `index.html` for unknown paths (SPA fallback), so frontend routes such as `/admin/reservations` work on refresh

## Later Ideas

These are tracked as part of milestones M5–M7 above:

- Resource categories
- Reservation history filters
- Availability exceptions
- Email notifications
- Calendar export
