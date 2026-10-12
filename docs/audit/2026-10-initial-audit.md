# Initial Project Audit (October 2026)

This audit was carried out on the finished MVP (commit `2680ffd`) before production hardening began. It is the reference for the milestone roadmap in [roadmap.md](../roadmap.md).

**Method:** every backend controller, model, DTO, the migration snapshot, `Program.cs`, configuration, CI, the tests, `App.tsx`, the API client, auth storage, the booking components and all documentation were read in full. Other frontend components were sampled.

**Confidence:** findings marked *Verified* were confirmed by reading the code. Findings marked *Risk* depend on how the app is deployed or used. The test suite passed at audit time (52 tests). The application itself was not run.

Finding IDs (H1, M2, L5, ...) are referenced from commits and docs. Status updates are tracked in [roadmap.md](../roadmap.md), not here.

## 1. Executive summary

The MVP is in good shape for its size. The structure is clean, the DTO boundaries are explicit, and the error format is consistent. Ownership checks on reservations are correct, passwords use PBKDF2 via `PasswordHasher`, and the login error is generic. Registration can't escalate to Admin (there is a test for this), and resources with booking history can't be deleted. CI runs backend tests, lint, build and Playwright. Tests are readable and well named.

The main gaps are in **booking correctness**, **production readiness** and **maintainability as the app grows**:

- **Two booking-correctness bugs.** The schedule the UI shows and the rule that validates a booking use different logic, so some slots the UI offers will be rejected. Bookings in the past are also accepted.
- **No protection against concurrent double-booking.** The overlap check and the insert are separate steps with no transaction or database constraint between them.
- **An anonymous endpoint with no range limit.** The schedule endpoint accepts any date range and needs no login, so a single request can make the server do a very large amount of work.
- **Not deployable as it stands.** CORS is only configured for Development, and there is no global exception handler, no health check and no migration strategy.
- **Frontend state is centralised in one 1,135-line component.** About 60 `useState` hooks live in [App.tsx](../../frontend/resource-reservation-client/src/App.tsx) and are passed down through views with dozens of props each. There is no router.
- **Tests miss whole layers.** Backend tests call controllers directly against the InMemory provider, which skips `[Authorize]`, model validation, serialization and relational behaviour. The Playwright tests mock the whole API, so there is no true end-to-end test.

None of this calls for a rewrite. Each item can be fixed in small, focused PRs.

---

## 2. Prioritised findings

**Labels:**
- **Severity:** High means correctness, security or data integrity. Medium means it affects production readiness or maintainability. Low means polish.
- **Status:** **[Verified]** means confirmed by reading the code. **[Risk]** means plausible but depends on how the app is deployed or used.

### High

| # | Finding | Where | Status |
|---|---|---|---|
| H1 | **Concurrent double-booking.** The overlap check (`AnyAsync`) and the insert (`SaveChangesAsync`) are separate steps with no transaction, lock or database constraint. Two simultaneous requests can both pass the check and both insert. | [ReservationsController.cs:116-139](../../backend/ResourceReservation.Api/Controllers/ReservationsController.cs#L116-L139) | Verified (code path). Not reproduced under load. |
| H2 | **The schedule and booking validation disagree.** `GetResourceSchedule` joins touching or overlapping one-off windows and weekly rules into one continuous slot (`MergeIntervals`; touching slots merge because the gap check uses `>`). `IsInsideAvailability` only accepts a booking that fits inside **one** window or **one** rule. Example: weekly rules Mon 08–12 and Mon 12–16 are allowed because they only touch. The UI shows one 08–16 slot, but booking 11:00–13:00 fails with "not available". The root cause is that availability logic is duplicated across two controllers. | [ResourcesController.cs:249-274](../../backend/ResourceReservation.Api/Controllers/ResourcesController.cs#L249-L274) vs [ReservationsController.cs:216-246](../../backend/ResourceReservation.Api/Controllers/ReservationsController.cs#L216-L246) | Verified (logic) |
| H3 | **Bookings in the past are accepted.** No check compares the start time with the current time. The schedule also shows earlier hours of today, and any past dates the user picks, as bookable. | `CreateReservation`, `GetResourceSchedule` | Verified |
| H4 | **Anonymous schedule endpoint with no range limit.** `ResourcesController` has no `[Authorize]`, and the `from..to` loop has no maximum. `to=9999-12-31` runs millions of loop iterations, then overflows `AddDays` and returns a 500 error. That makes it a cheap way to tie up the server. | [ResourcesController.cs:42-79, 217](../../backend/ResourceReservation.Api/Controllers/ResourcesController.cs#L217) | Verified (code path) |

### Medium

| # | Finding | Where | Status |
|---|---|---|---|
| M1 | **Production configuration gaps.** CORS is only enabled in Development, so a deployed frontend on a different origin will be blocked. There is no `UseExceptionHandler`/ProblemDetails, so unhandled exceptions such as `DbUpdateException` return a 500 that doesn't use `ApiErrorResponseDto`. There are no health checks and no migration strategy. Config isn't validated at startup beyond the JWT key, and Issuer and Audience can be null. | [Program.cs](../../backend/ResourceReservation.Api/Program.cs) | Verified |
| M2 | **Database integrity.** There is no unique index on `Users.Email`. Registration checks for an existing email and then inserts, so two concurrent registrations can create duplicates, and `Email.ToLower()` stops the index being used. Every string column is `nvarchar(max)`. `Status` is free text with no check constraint. There is no composite index for the overlap query. Deleting a user **cascade-deletes their reservation history**. The Resource→Reservation cascade is only guarded in controller code. | [AppDbContextModelSnapshot.cs](../../backend/ResourceReservation.Api/Migrations/AppDbContextModelSnapshot.cs), [AppDbContext.cs](../../backend/ResourceReservation.Api/Data/AppDbContext.cs) (no `OnModelCreating`) | Verified |
| M3 | **Expired sessions aren't handled.** The token lasts 2 hours. The UI restores the user from `localStorage` without checking whether the token has expired, and there is no global 401 handling. After expiry the user appears logged in, but every action fails with "Error: Authentication is required." | [authStorage.ts](../../frontend/resource-reservation-client/src/auth/authStorage.ts), [client.ts](../../frontend/resource-reservation-client/src/api/client.ts) | Verified |
| M4 | **No brute-force protection.** Login and register have no rate limiting and no account lockout. Register returns "Email is already registered", which lets anyone check whether an account exists. | [AuthController.cs](../../backend/ResourceReservation.Api/Controllers/AuthController.cs) | Verified. The impact is a deployment risk. |
| M5 | **Implicit time-zone model.** The frontend sends `datetime-local` values with no offset. The backend stores them as `DateTime` with Unspecified kind. An API client that sends `Z` will store UTC values next to local ones. This only works while every user and the server share one time zone. It also blocks a correct "is this in the past" check (H3) once the server runs in UTC in the cloud. | DTOs and models using `DateTime` | Risk. Needs a decision. |
| M6 | **Fat controllers with duplicated logic.** Business rules live in controllers. `ApiError`, `GetCurrentUserId` and the time-range code are duplicated, and the duplicated availability logic is what causes H2. Validation also happens twice: once with DataAnnotations and again with manual checks. | All controllers | Verified |
| M7 | **The frontend is a "god component".** App.tsx holds about 60 state hooks and every handler. Views receive around 60 props, and there are pass-through wrappers such as `UserResourceBookingScreen`. There is no router: tabs are local state, so a refresh loses your place and there are no deep links or back-button support. Date helpers live inside App.tsx. | [App.tsx](../../frontend/resource-reservation-client/src/App.tsx), [AdminHomeView.tsx](../../frontend/resource-reservation-client/src/views/AdminHomeView.tsx), [UserHomeView.tsx](../../frontend/resource-reservation-client/src/views/UserHomeView.tsx) | Verified |
| M8 | **Test-strategy gaps.** There are 46 controller unit tests on EF InMemory. Calling controllers directly skips `[Authorize]`/roles, model validation, routing and JSON. InMemory also skips transactions and constraints. Playwright mocks the API (`page.route` at [frontend-smoke.spec.ts:310](../../frontend/resource-reservation-client/tests/smoke/frontend-smoke.spec.ts#L310)). There is no integration testing with `WebApplicationFactory`, no coverage report, and no tests for H1–H4. | `backend/ResourceReservation.Api.Tests/` | Verified |

### Low

| # | Finding | Where |
|---|---|---|
| L1 | The admin reservation list shows "User ID: 5" rather than a name or email. | [ReservationsSection.tsx:116](../../frontend/resource-reservation-client/src/components/ReservationsSection.tsx#L116) |
| L2 | When a user cancels a booking, the schedule isn't refreshed, and an unneeded `getAvailabilities()` call runs. | [App.tsx:700-705](../../frontend/resource-reservation-client/src/App.tsx#L700-L705) |
| L3 | Fully booked days disappear from the schedule, and their reserved slots disappear with them, because days are grouped only from bookable slots. | [ResourceBookingSection.tsx:285-312](../../frontend/resource-reservation-client/src/components/ResourceBookingSection.tsx#L285-L312) |
| L4 | A ternary has two identical branches (dead code). | [ResourceBookingSection.tsx:101-103](../../frontend/resource-reservation-client/src/components/ResourceBookingSection.tsx#L101-L103) |
| L5 | A booking conflict returns 400. 409 Conflict is the more accurate status. | ReservationsController |
| L6 | If an API client omits `UpdateResourceDto.IsActive`, it defaults to `false` and silently deactivates the resource. | [UpdateResourceDto.cs](../../backend/ResourceReservation.Api/DTOs/UpdateResourceDto.cs) |
| L7 | `Reservation` has no `CreatedAt`, `CancelledAt` or `CancelledBy`, so there is no audit trail. | [Reservation.cs](../../backend/ResourceReservation.Api/Models/Reservation.cs) |
| L8 | The confirmation dialog has no focus trap, no initial focus and no Escape handling. | [App.tsx:968-999](../../frontend/resource-reservation-client/src/App.tsx#L968-L999) |
| L9 | List endpoints have no pagination. `GetReservationsByUser` doesn't check that the user exists. | ReservationsController |
| L10 | The anonymous schedule response exposes reservation IDs. This is a minor information leak. | `ReservedSlotResponseDto` |
| L11 | The dev JWT key and seed admin password are committed in `appsettings.Development.json`. That is fine for local development, but they would be a real risk if production ever ran with `ASPNETCORE_ENVIRONMENT=Development`. **[Risk]** | [appsettings.Development.json](../../backend/ResourceReservation.Api/appsettings.Development.json) |
| L12 | `Microsoft.AspNetCore.OpenApi` is referenced alongside Swashbuckle but isn't needed. | [.csproj](../../backend/ResourceReservation.Api/ResourceReservation.Api.csproj) |

### Functional gaps for real-world use (not bugs)

The app is missing:
- Booking policies: minimum and maximum duration, slot granularity, how far ahead a booking can be made, and a cap on active bookings per user.
- Reservation edit or reschedule.
- Availability exceptions, such as holidays and maintenance closures.
- Admin user management: listing users, changing roles, deactivating accounts.
- Password reset and email verification.
- Notifications.
- A purpose or notes field on reservations.
- Search and pagination.
- Per-resource time zones (only if multi-site use is a goal).

### UI/UX observations

**Strengths:**
- Labels are used throughout.
- `role="status"`/`role="alert"` are used for messages.
- There is dark-mode support.
- There are two 760px breakpoints.
- The booking flow starts by picking a resource, which matches how people book in practice.

**Gaps:**
- There is no routing or deep linking.
- Feedback is inline text only, with no toasts.
- There is no week-view calendar.
- Errors are prefixed with "Error: ", which reads roughly.
- Admins see user IDs rather than names (L1).
- The dialog has accessibility gaps (L8).
- Responsiveness wasn't checked visually. Screenshots or a browser run would be needed.

### Documentation observations

**Strengths:** the README is strong. It has screenshots, a feature list, an API overview, setup steps and a domain model.

**Outdated:**
- The README's CI section leaves out the Playwright step that CI does run.
- [roadmap.md](../roadmap.md) still lists "Add README Screenshots" as the current priority, but that work is done.
- [planning.md](../planning.md) describes the original plan, not the system as built.

**Missing:**
- Architecture and ER diagrams.
- A configuration and environment-variable reference.
- A deployment guide.
- A security notes page.
- A testing guide.
- A write-up of key decisions (ADRs).
- A troubleshooting section.

---

## 3. Recommended roadmap

Each milestone is a set of small PRs that each pass CI on their own.

1. **M1: Booking correctness and data integrity** (recommended first; step breakdown in [roadmap.md](../roadmap.md)). Fixes H1–H4, M2 and L5.
2. **M2: Backend structure and real test coverage.**
   - Move business logic out of controllers into a few services (`ReservationService`, `AuthService`/`TokenService`), extending the `AvailabilityService` that M1 introduces.
   - Add global exception handling with ProblemDetails, keeping the current `{message, errors}` response shape.
   - Load config through the Options pattern with `ValidateOnStart`.
   - Add a `WebApplicationFactory` integration-test project against real SQL Server, using Testcontainers in CI, to cover auth, validation and concurrency.
   - Add coverage reporting.
3. **M3: Security and production configuration.**
   - Add a production CORS policy driven by config.
   - Add rate limiting on the auth endpoints, using ASP.NET's built-in `RateLimiter`.
   - Add health checks, security headers, a migration step at deploy time, and a note on storing secrets.
   - On the frontend, check token expiry and log the user out on a 401 (M3 in the findings).
4. **M4: Frontend architecture.**
   - Add React Router with routes per role.
   - Split App.tsx state into feature hooks such as `useResources` and `useReservations`, and consider TanStack Query for server state.
   - Move date and format helpers to `src/lib`.
   - Remove the pass-through wrappers.
   - Add Vitest unit tests for the helpers and hooks.
   - Behaviour stays the same throughout.
5. **M5: UI/UX modernisation.**
   - Design tokens and shared components (Button, Dialog, Toast, EmptyState).
   - A week-view calendar.
   - An accessible dialog.
   - Show user names to admins.
   - Show fully booked days.
   - Run an axe check in Playwright.
6. **M6: Real-world features.**
   - Reservation audit fields.
   - Booking policies.
   - Reschedule.
   - Availability exceptions.
   - Admin user management.
7. **M7: Deployment.**
   - Docker Compose with the API, SQL Server and the frontend served by nginx.
   - A continuous-deployment workflow and a hosted demo.
   - A real end-to-end Playwright suite that runs against the containerised stack. It sits alongside the existing mocked smoke tests.

Each milestone also updates the documentation it affects.

## 4. Suggested documentation structure

```
README.md            overview, screenshots, architecture diagram, 5-minute quick start, links to docs/
docs/
  architecture.md    system context + component diagrams (Mermaid), backend/frontend layering
  domain-model.md    ER diagram (Mermaid), booking rules, time-zone convention, statuses
  api.md             conventions, auth, error format, status codes (Swagger stays the reference)
  development.md     prerequisites, setup, env/config reference table, seed accounts, troubleshooting
  testing.md         test pyramid, how to run each suite, what each covers
  deployment.md      environments, required config/secrets, migrations, hosting
  security.md        auth model, password storage, token handling, known limitations
  adr/               0001-time-zone-convention.md, 0002-reservation-concurrency.md, 0003-jwt-storage.md
  roadmap.md         refreshed against this audit
  history/planning.md  (move the original planning doc here)
  screenshots/
CONTRIBUTING.md      branch/PR workflow, user-story issue format (already described in roadmap.md)
```

Mermaid diagrams render natively on GitHub. The most useful ones to add are a system context diagram, an ER diagram, and a sequence diagram for "create reservation" that shows how the transaction prevents double-booking.
