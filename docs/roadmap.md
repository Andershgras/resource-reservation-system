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

- [x] #1 Add Backend Tests For Reservation Rules
- [x] #2 Add Frontend Validation For Availability Forms
- [x] #3 Improve Frontend Feedback States
- [x] #4 Add Demo Seed Data
- [x] #6 Add GitHub Actions Build Workflow
- [x] #7 Add Basic Frontend Smoke Test Plan
- [x] #8 Add Architecture Overview Documentation
- [x] #21 Add API Error Response Consistency

## Open User Stories

### Add README Screenshots

As a portfolio viewer, I want screenshots of the app, so that I can quickly understand what the project does.

Acceptance criteria:

- README includes at least one Admin screenshot
- README includes at least one User screenshot
- Screenshots match the current MVP UI
- README remains concise

## Later Ideas

These ideas should wait until the MVP is stable and well documented:

- Resource categories
- Reservation history filters
- Admin view by resource
- User reservation editing
- Recurring availability
- Email notifications
- Calendar export
- Docker setup
- Deployment

## Current Priority

The next recommended work is:

```text
Add README Screenshots
```

Reason: the core MVP is implemented, tested, and documented. Screenshots would make the project easier to understand quickly as a portfolio piece.
