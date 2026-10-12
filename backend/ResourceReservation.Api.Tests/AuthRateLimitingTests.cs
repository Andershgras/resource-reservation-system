using System.Net;
using ResourceReservation.Api.Configuration;

namespace ResourceReservation.Api.Tests;

public class AuthRateLimitingTests
{
    [Theory]
    [InlineData("198.51.100.10", "198.51.100.10")]
    [InlineData("::ffff:198.51.100.10", "198.51.100.10")]
    [InlineData("2001:db8:1:2:3:4:5:6", "2001:db8:1:2::/64")]
    [InlineData("2001:db8:1:2:ffff:ffff:ffff:ffff", "2001:db8:1:2::/64")]
    public void GetClientPartitionKey_GroupsAddressesByClient(string address, string expectedKey)
    {
        Assert.Equal(expectedKey, AuthRateLimiting.GetClientPartitionKey(IPAddress.Parse(address)));
    }

    [Fact]
    public void GetClientPartitionKey_WithoutAddress_UsesOneSharedKey()
    {
        Assert.Equal("unknown", AuthRateLimiting.GetClientPartitionKey(null));
    }

    [Fact]
    public void GetReplenishmentPeriod_SpreadsPermitsOverWindow()
    {
        var options = new AuthRateLimitOptions { PermitLimit = 10, WindowSeconds = 60 };

        Assert.Equal(TimeSpan.FromSeconds(6), options.GetReplenishmentPeriod());
    }
}
