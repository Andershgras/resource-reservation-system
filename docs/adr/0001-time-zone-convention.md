# ADR 0001: Store Times As Wall-Clock Time In One Configured Time Zone

- **Status:** Accepted
- **Date:** 2026-10-12
- **Related findings:** H3, M5 in the [initial audit](../audit/2026-10-initial-audit.md)

## Context

Reservations, one-off availability windows and weekly rules are stored as `DateTime` and `TimeOnly` values with no offset. The frontend sends `datetime-local` values, such as `2030-01-15T10:00`, and the API stores them as they are.

Until now that worked by accident, because the browser, the server and the people booking all shared one time zone. Two things broke that assumption:

- To reject bookings in the past, the API needs to know what "now" is in the same frame of reference as the stored times. A cloud host usually runs in UTC, so `DateTime.Now` on the server would be wrong by one or two hours.
- Weekly rules like "Monday 08:00–16:00" are inherently local times. They have to stay 08:00–16:00 across daylight saving changes.

## Decision

- All stored reservation and availability times are **wall-clock times in one configured scheduling time zone**.
- The zone is set by `Scheduling:TimeZoneId` in configuration, using an IANA ID. The default is `Europe/Copenhagen`.
- `SchedulingClock` (in `Services/`) works out "now" by converting `TimeProvider.GetUtcNow()` into that zone. Production code uses `TimeProvider.System`. Tests use `FakeTimeProvider`, so they don't depend on the real date.
- The app fails at startup if the setting is missing or isn't a known zone.

## Consequences

- No data migration was needed. Existing rows already follow this convention.
- Rules keep their local times across daylight saving changes.
- A local time that falls in the spring-forward gap, or occurs twice in the autumn fall-back hour, isn't treated specially. For a booking system with daytime opening hours, that's acceptable. (Changed in Milestone 6 PR 4 for the spring gap; see Updates.)
- The system serves resources in **one** time zone. Supporting several sites in different zones would mean storing a time zone per resource, or moving to `DateTimeOffset`. That change should get its own ADR.
- API clients must send local times with no offset. A value ending in `Z` would be read as a local wall-clock time.

## Updates

- **Milestone 6 PR 4: times that never happen are rejected.** When summer time starts, the clocks go from 02:00 straight to 03:00, so 02:00–02:59 that night never happens. Bookings, moves, closures and one-off windows can't start or end in that hour; the API answers `400` with "That time doesn't exist…" (`SchedulingClock.CheckTimesExist`). Periods across the hour, such as 01:30–03:30, are still allowed. Durations stay wall-clock durations, as before, so that booking counts as two hours although one real hour passes. The calendar never offers such times, and the closure and window forms check them before sending. Converting such a time to UTC throws rather than moving it. Times in the repeated autumn hour do happen, so they are accepted, and read as their first occurrence when converted to UTC. Weekly rules are times of day for every week, so a rule may still cover the skipped hour; the times inside it simply can't be booked that night. Bookings made before this change are not re-checked.

- **Milestone 6:** reservation audit times (`CreatedAt`, `UpdatedAt`, `CancelledAt`) are UTC `datetimeoffset` instants, not wall-clock times. They record when something happened, rather than when a booking is for. `SchedulingClock.GetUtcNow()` provides them, through the same `TimeProvider`. See [ADR 0008](0008-booking-policies-and-reservation-changes.md).
