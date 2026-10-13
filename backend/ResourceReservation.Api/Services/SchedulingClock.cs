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
}
