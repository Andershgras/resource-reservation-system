# ADR 0002: Serialize Bookings Per Resource With A SQL Server Application Lock

- **Status:** Accepted
- **Date:** 2026-10-12
- **Related findings:** H1, L5 in the [initial audit](../audit/2026-10-initial-audit.md)

## Context

Creating a reservation first checks for an overlapping active reservation, then inserts the new one. With nothing coordinating the two steps, two simultaneous requests for the same slot could both pass the check and both insert. That's a double booking.

A unique constraint can't prevent this, because the rule is "time ranges must not overlap", not "values must not repeat". Two approaches were considered:

1. **A `Serializable` transaction.** SQL Server's key-range locks make racing inserts deadlock, and the victim (error 1205) is turned into a conflict response. This works, but correctness depends on the deadlock path, and on an index that keeps the locked ranges narrow.
2. **A per-resource application lock.** Inside a normal transaction, `sp_getapplock` takes an exclusive lock named `reservation:resource:{id}` before the overlap check.

## Decision

Use option 2.

`ReservationService.CreateAsync` (originally `ReservationsController.CreateReservation`) does the following:

1. Validates the request without holding any lock.
2. Opens a transaction.
3. Takes the application lock for the resource, waiting up to `Scheduling:BookingLockTimeoutMilliseconds` (10 seconds by default).
4. Runs the overlap check and inserts the reservation.
5. Commits.

The lock belongs to the transaction, so SQL Server releases it on commit, on rollback, or when the request ends early.

Overlaps now return **409 Conflict** instead of 400.

## Consequences

- Bookings for the same resource run one at a time: the second request waits, sees the first booking, and gets a clean 409. Bookings for different resources don't block each other.
- There's no reliance on deadlocks.
- **Any new code that creates or moves reservations must take the same lock.** The locks live in one place, `BookingLocks.AcquireAsync` (before Milestone 6 PR 2, `ReservationService.AcquireBookingLocksAsync`, and originally `AcquireResourceBookingLockAsync`).
- This ties the project to SQL Server, which was already the only database it targets.
- The EF InMemory provider used in unit tests has no transactions, so the lock is skipped when the database isn't relational. Concurrency is checked against real SQL Server by the integration tests: 10 parallel identical bookings give one 201 and nine 409s. With the lock disabled, all ten succeed.
- If the lock can't be acquired in time, the API returns `503 Service Unavailable` with `Retry-After: 5` and a message asking the user to try again. The request didn't conflict with a booking; the system was just busy.

## Updates

- **Milestone 2:** the lock moved from the controller into `ReservationService`. It now reads `sp_getapplock`'s return code through an output parameter instead of raising a SQL error. A timeout (-1) or deadlock victim (-3) becomes a 503 with `Retry-After`, where it used to be an unhandled 500. Any other negative code throws. The timeout became configurable.
- **Milestone 6:** creating a booking also takes a per-user lock, `reservation:user:{id}`, because the cap on upcoming bookings spans resources. Bookings for different resources don't share a resource lock, so without it parallel bookings could all pass the cap check. The locks are always taken **user first, then resource**, in one transaction, so two requests can't each hold one while waiting for the other. Ten parallel bookings across ten resources give exactly the cap; with the user lock disabled, all ten succeeded. Moving a booking takes only the resource lock, because the number of bookings doesn't change. See [ADR 0008](0008-booking-policies-and-reservation-changes.md).
- **Milestone 6 PR 2:** the locks moved into a `BookingLocks` service, so creating a closure can take the resource lock too ([ADR 0009](0009-availability-exceptions.md)). Booking and moving now check availability after taking the lock, so a closure saved while they wait is never missed.
