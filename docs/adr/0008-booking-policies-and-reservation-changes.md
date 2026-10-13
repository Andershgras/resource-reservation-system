# ADR 0008: Booking Policies, Rescheduling And Reservation History

- **Status:** Accepted
- **Date:** 2026-10-13
- **Related findings:** L7 and the feature gaps in the [initial audit](../audit/2026-10-initial-audit.md)

## Context

Until Milestone 6, any free time inside opening hours could be booked for any length, any time ahead, and a user could hold any number of bookings. A booking couldn't be moved, only cancelled and made again. Reservations didn't record when they were made or who cancelled them (audit L7).

Milestone 6 adds the rules a real booking system needs. PR 1 covers booking policies, moving a booking and its history.

## Decision

### Booking policies

- **Five rules**, set in the validated `BookingPolicy` configuration section:

  | Rule | Default |
  |---|---|
  | Minimum duration | 15 minutes |
  | Maximum duration | 8 hours |
  | Minimum notice before the start | 0 minutes |
  | How many days ahead | 90 |
  | Upcoming bookings per user | 5 |

- **Per-resource overrides:** a resource can override the first four with nullable columns. **Null means the resource uses the default**, so changing a default in configuration changes every resource that hasn't overridden it. The cap on upcoming bookings applies across resources, so it is global only.
- **The same rules apply to every role.** Admins get no implicit exemption.
- **The horizon counts days, not hours.** With 90 days, a booking may end at the latest at midnight at the end of the day 90 days from today, in Copenhagen time. Whole days are bookable, which matches the weekly calendar.
- **"Upcoming" bookings** for the cap are active and haven't ended yet. Cancelled and finished bookings don't count.
- **One calculation:** `BookingPolicy.For(resource, defaults)` gives the rules in force. Booking validation and the schedule both use it, as with availability ([ADR 0002](0002-reservation-concurrency.md), audit H2). The schedule only offers time inside the notice period and the horizon, and leaves out free periods shorter than the minimum. It also returns the rules, so the calendar offers only allowed start and end times.
- **Existing reservations are never re-checked.** A booking made before a rule existed stays active and can still be cancelled. Rules apply when a booking is made or moved.
- **Rules must be possible to meet** (`BookingPolicy.CanBeMet`). The minimum duration can't exceed the maximum, and the notice plus the shortest booking must fit within the days ahead, at any time of day. The last bookable moment is always at least `MaxAdvanceDays` whole days away, so that is the bound. The defaults are checked at startup. Resource overrides are checked against the rules in force when they are saved, and a check constraint keeps stored overrides in range.

### Moving a booking

- `PUT /api/reservations/{id}` moves a booking to a new time **on the same resource**. A move to another resource is a cancellation and a new booking. That keeps every move under one resource's lock.
- Only the owner or an admin can move a booking, and only before it starts. Cancelled bookings can't be moved.
- The new time is checked like a new booking: availability, the policy and overlaps. Two exceptions: the booking doesn't clash with its own old time, and it doesn't count again towards the cap.
- Moves take the resource's booking lock, like new bookings.
- **The calendar's move mode** asks the schedule to leave out the booking being moved (`excludeReservationId`), so its own time shows as free. The schedule is otherwise anonymous, so this parameter needs the booking's owner or an admin.

### Lost updates

- Reservations have a SQL Server `rowversion` column. Responses include it as an opaque `version`.
- **Moving needs the version** of the copy the change is based on. **Cancelling accepts it optionally**, so clients that send no body keep working.
- A version that doesn't match, or a change saved by someone else between reading and saving (EF Core puts the `rowversion` in the `UPDATE`'s `WHERE` clause), returns **409 Conflict** with "This reservation was changed by someone else. Reload it and try again." Both cases give the same problem response.
- 409 now means "the data changed under you": an overlap, or an out-of-date copy. The frontend reloads in both cases.

### History

- `CreatedAt`, `UpdatedAt` (when the time last changed), `CancelledAt` and `CancelledByUserId`.
- Audit times are **UTC `datetimeoffset` instants**, unlike booking times, which are wall-clock times ([ADR 0001](0001-time-zone-convention.md)). They record when something happened, not when a booking is for. The frontend shows them in Copenhagen time.
- **Reservations from before the fields existed keep null values.** The migration doesn't invent times it never recorded.

## Consequences

- A migration test upgrades a database holding pre-Milestone 6 data, and checks that every row survives with its audit fields empty and no overrides.
- The integration tests run with a 3650-day horizon, because their bookings are dated 2030. One test checks the real 90-day default with dates relative to today.
- The cap needs its own lock: see the update to [ADR 0002](0002-reservation-concurrency.md).
- Admins can move any booking through the API. Their screens get a calendar in Milestone 6 PR 2. Until then, moving in the browser is for users moving their own bookings.
- Changing a default changes every resource without its own value. That's intended, but it means a configuration change can make a resource's override contradict the new default, such as a minimum longer than a lowered maximum. Overrides can't be re-checked when configuration changes, so the rules are also checked at run time. Such a resource offers no time in the schedule, and booking or moving returns "This resource's booking rules can't be met…" until an admin fixes the override.
