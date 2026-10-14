namespace ResourceReservation.Api.Services;

// Reservation and availability times are stored as wall-clock time in one
// configured time zone. This clock gives "now" in that same time zone,
// independent of the server's own time zone.
public class SchedulingClock
{
    private readonly TimeProvider _timeProvider;
    private readonly TimeZoneInfo _timeZone;

    public SchedulingClock(TimeProvider timeProvider, TimeZoneInfo timeZone)
    {
        _timeProvider = timeProvider;
        _timeZone = timeZone;
    }

    public DateTime GetLocalNow()
    {
        return TimeZoneInfo.ConvertTime(_timeProvider.GetUtcNow(), _timeZone).DateTime;
    }

    // For audit timestamps, which record an instant rather than a wall-clock time.
    public DateTimeOffset GetUtcNow()
    {
        return _timeProvider.GetUtcNow();
    }

    public const string NonexistentTimeMessage =
        "That time doesn't exist: the clocks skip it when summer time starts. Choose a time outside the skipped hour.";

    // True for a wall-clock time that never happens in the scheduling time
    // zone: the hour skipped when summer time starts, 02:00–02:59 in
    // Copenhagen on the last Sunday of March. Bookings, moves, closures and
    // one-off windows can't start or end at such a time (ADR 0001).
    public bool IsNonexistent(DateTime wallClock)
    {
        return _timeZone.IsInvalidTime(DateTime.SpecifyKind(wallClock, DateTimeKind.Unspecified));
    }

    // A validation error if the start or end of a period never happens.
    public ServiceError? CheckTimesExist(DateTime startTime, DateTime endTime)
    {
        return IsNonexistent(startTime) || IsNonexistent(endTime)
            ? ServiceError.Validation(NonexistentTimeMessage)
            : null;
    }

    // The UTC instant of a wall-clock time in the scheduling time zone, for
    // calendar invitations. A time that never happens has no instant and
    // throws, rather than being moved silently; such times are rejected when
    // they are entered. A time in the repeated autumn hour happens twice and
    // is read as its first occurrence, in summer time.
    public DateTime ToUtc(DateTime wallClock)
    {
        var local = DateTime.SpecifyKind(wallClock, DateTimeKind.Unspecified);

        if (_timeZone.IsInvalidTime(local))
        {
            throw new ArgumentException(
                $"{local:yyyy-MM-dd HH:mm} doesn't exist in the scheduling time zone.",
                nameof(wallClock));
        }

        var offset = _timeZone.IsAmbiguousTime(local)
            ? _timeZone.GetAmbiguousTimeOffsets(local).Max()
            : _timeZone.GetUtcOffset(local);

        return DateTime.SpecifyKind(local - offset, DateTimeKind.Utc);
    }
}
