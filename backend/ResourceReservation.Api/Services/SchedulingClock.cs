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

    // The UTC instant of a wall-clock time in the scheduling time zone, for
    // calendar invitations. A time in the spring-forward gap doesn't exist, so
    // it is read with the offset from before the gap, which lands it where the
    // clock jumps to: 02:30 becomes 03:30 summer time. A time in the repeated
    // autumn hour is read as its first occurrence, in summer time.
    public DateTime ToUtc(DateTime wallClock)
    {
        var local = DateTime.SpecifyKind(wallClock, DateTimeKind.Unspecified);
        var offset = _timeZone.IsInvalidTime(local)
            ? _timeZone.GetUtcOffset(local.AddHours(-3))
            : _timeZone.IsAmbiguousTime(local)
                ? _timeZone.GetAmbiguousTimeOffsets(local).Max()
                : _timeZone.GetUtcOffset(local);

        return DateTime.SpecifyKind(local - offset, DateTimeKind.Utc);
    }
}
