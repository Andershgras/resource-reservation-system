using Microsoft.Extensions.Time.Testing;
using ResourceReservation.Api.Services;

namespace ResourceReservation.Api.Tests;

internal static class TestSchedulingClock
{
    public static readonly TimeZoneInfo TimeZone =
        TimeZoneInfo.FindSystemTimeZoneById("Europe/Copenhagen");

    public static SchedulingClock Create(DateTime? localNow = null)
    {
        var now = localNow ?? new DateTime(2029, 1, 1, 12, 0, 0);
        var utcNow = TimeZoneInfo.ConvertTimeToUtc(now, TimeZone);

        return new SchedulingClock(
            new FakeTimeProvider(new DateTimeOffset(utcNow, TimeSpan.Zero)),
            TimeZone);
    }
}
