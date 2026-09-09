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

## Next Focus

The next phase should improve confidence, maintainability, and portfolio presentation before adding larger features.

Recommended focus areas:

- Stabilization
- Automated tests
- Frontend validation and feedback
- Demo data
- Portfolio documentation
- Simple deployment preparation

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

## Later Ideas

These ideas should wait until the MVP is stable and well documented:

- Resource categories
- Reservation history filters
- Admin view by resource
- User reservation editing
- Availability exceptions
- Email notifications
- Calendar export
- Docker setup
- Deployment

## Current Priority

The next recommended work is:

```text
Add README Screenshots
```

Reason: the core booking flow now matches the resource-first schedule model, so screenshots can show a more realistic portfolio-ready workflow.
