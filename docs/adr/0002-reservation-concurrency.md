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

`ReservationsController.CreateReservation` does the following:

1. Validates the request without holding any lock.
2. Opens a transaction.
3. Takes the application lock for the resource, waiting up to 10 seconds.
4. Runs the overlap check and inserts the reservation.
5. Commits.

The lock belongs to the transaction, so SQL Server releases it on commit, on rollback, or when the request ends early.

Overlaps now return **409 Conflict** instead of 400.

## Consequences

- Bookings for the same resource run one at a time: the second request waits, sees the first booking, and gets a clean 409. Bookings for different resources don't block each other.
- There's no reliance on deadlocks.
- **Any new code that creates or moves reservations must take the same lock.** The lock lives in a single method (`BeginResourceBookingLockAsync`), which should move into the reservation service when the service layer is extracted (Milestone 2).
- This ties the project to SQL Server, which was already the only database it targets.
- The EF InMemory provider used in unit tests has no transactions, so the lock is skipped when the database isn't relational. Concurrency is checked against real SQL Server instead. Manually, 10 parallel identical bookings against LocalDB gave one 201 and nine 409s. Automated coverage arrives with the integration tests planned for Milestone 2.
- If the lock times out, the API returns a 500 until a global error handler is added (Milestone 2).
