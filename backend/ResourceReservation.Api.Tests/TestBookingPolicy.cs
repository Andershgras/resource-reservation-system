using Microsoft.Extensions.Options;
using ResourceReservation.Api.Configuration;

namespace ResourceReservation.Api.Tests;

internal static class TestBookingPolicy
{
    // The production defaults, except that bookings can be made years ahead,
    // because the test data is dated 2030 while the test clock is in 2029.
    // Tests of the booking horizon set their own value.
    public static IOptions<BookingPolicyOptions> Create(Action<BookingPolicyOptions>? configure = null)
    {
        var options = new BookingPolicyOptions { MaxAdvanceDays = BookingPolicyOptions.MaxAdvanceDaysLimit };
        configure?.Invoke(options);

        return Options.Create(options);
    }
}
