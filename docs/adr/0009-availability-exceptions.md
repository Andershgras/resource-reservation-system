# ADR 0009: Closures (Availability Exceptions)

- **Status:** Accepted
- **Date:** 2026-10-14
- **Related:** [ADR 0001](0001-time-zone-convention.md), [ADR 0002](0002-reservation-concurrency.md), [ADR 0008](0008-booking-policies-and-reservation-changes.md), audit H2

## Context

Opening hours came from one-off windows and weekly rules. There was no way to say "closed on 24 December" or "closed Tuesday morning for repairs" short of editing the rules, which would also change every other week.

Milestone 6 PR 2 adds closures. Agreed requirements:
- Closures may overlap, and each keeps its own reason. Deleting one must not reopen time another still covers.
- There are no recurring closures yet.
- Before a closure is saved, the admin sees the bookings inside it.
- Reservations are never cancelled automatically.
- Changes between the preview and the save are handled safely, using the existing booking lock.

## Decision

### Data

- **A new table, `AvailabilityExceptions`:** resource, start, end, reason (up to 200 characters), created at (UTC) and created by.
- **Wall-clock times** in the scheduling time zone, like availability ([ADR 0001](0001-time-zone-convention.md)). A closure over the skipped or repeated daylight-saving hour closes exactly those clock times. Booking validation and the schedule agree on this.
- **Constraints:** a check constraint requires the end to be after the start. Closures cascade when their resource is deleted, like availability windows.
- **Overlaps are stored as they are.** Nothing merges records, so each closure keeps its reason and can be deleted on its own.

### One calculation

`AvailabilityService.GetAvailabilityIntervalsAsync` is the only source of bookable time:
1. Merge the one-off windows and weekly rules into opening hours.
2. Subtract the closures. Overlapping closures subtract once.

Booking, moving and the schedule all go through it, so they can't disagree, which was the lesson of audit H2.

The schedule also returns `closedSlots`: the part of the opening hours that closures take away. Overlapping closures form one period listing every reason. Closed time outside opening hours isn't shown, so a whole-day holiday shows as that day's opening hours, not 24 hours.

### Who sees what

- **Reasons are public.** Everyone sees them in the calendar, and the admin form says so.
- **The closures endpoints are admin only.** Previews and results list who booked, and the closures list says who added each one.
- **The admin calendar gets owner details** from the admin-only `GET /api/reservations/resource/{id}?from=&to=`. The public schedule never includes names or email addresses. Tests check its JSON for every role.

### Preview, save and the lock

- `POST /api/availabilityexceptions/preview` lists the active reservations a closure would cover, and saves nothing.
- `POST /api/availabilityexceptions` saves the closure **under the resource's booking lock**, then lists the active reservations inside it, in the same transaction.
- Booking and moving now check availability **after** taking that lock, instead of before.

Together, either the booking commits first and appears in the closure's list, or it waits for the lock and then sees the closure and is refused. The list returned is therefore complete, even if it differs from the preview. The frontend shows that final list, not the preview.

### Bookings already inside

They stay active. The admin sees them before confirming, and afterwards as a list with Cancel buttons. In the calendar, a booking inside a closure is drawn beside the closure, so both stay visible.

## Consequences

- The lock code moved from `ReservationService` into a `BookingLocks` service shared by bookings, moves and closures, with the same names, order and timeout ([ADR 0002](0002-reservation-concurrency.md)).
- Two integration tests prove the lock matters, and each fails with its protection removed:
  - with the resource lock held elsewhere, creating a closure waits and returns 503
  - a booking waiting for the lock is refused once a closure is saved meanwhile
- Editing one-off windows and weekly rules still doesn't take the lock or report affected bookings, as before this ADR. Shortening opening hours is rarer than closing for a day, and can get the same treatment later.
- Recurring closures, such as every 24 December, would need a rule table like weekly availability. They are deferred.
