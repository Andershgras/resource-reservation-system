using System.ComponentModel.DataAnnotations;
using ResourceReservation.Api.Configuration;
using ResourceReservation.Api.Models;
using ResourceReservation.Api.Services;

namespace ResourceReservation.Api.Tests;

public class BookingPolicyTests
{
    private static readonly DateTime Now = new(2030, 1, 1, 10, 0, 0);
    private static readonly BookingPolicy DefaultPolicy = new(15, 480, 0, 90);

    [Fact]
    public void Options_DefaultToTheApprovedRules()
    {
        var options = new BookingPolicyOptions();

        Assert.Equal(
            (15, 480, 0, 90, 5),
            (options.MinDurationMinutes, options.MaxDurationMinutes, options.MinLeadTimeMinutes,
                options.MaxAdvanceDays, options.MaxActiveReservationsPerUser));
        Assert.Empty(Validate(options));
    }

    [Fact]
    public void Options_WhenMinimumDurationIsLongerThanMaximum_AreInvalid()
    {
        var options = new BookingPolicyOptions { MinDurationMinutes = 60, MaxDurationMinutes = 30 };

        var result = Assert.Single(Validate(options));
        Assert.Equal(
            "BookingPolicy:MinDurationMinutes cannot be greater than BookingPolicy:MaxDurationMinutes.",
            result.ErrorMessage);
    }

    [Fact]
    public void For_UsesTheResourcesOverridesAndDefaultsForTheRest()
    {
        var resource = new Resource { MaxDurationMinutes = 60, MinLeadTimeMinutes = 120 };

        var policy = BookingPolicy.For(resource, new BookingPolicyOptions());

        Assert.Equal(new BookingPolicy(15, 60, 120, 90), policy);
    }

    [Fact]
    public void Check_WhenNoLeadTimeAndStartIsInThePast_AsksForAFutureStart()
    {
        var error = DefaultPolicy.Check(Now.AddMinutes(-1), Now.AddHours(1), Now);

        Assert.Equal(BookingPolicy.StartInFutureMessage, error?.Message);
        Assert.Null(DefaultPolicy.Check(Now, Now.AddHours(1), Now));
    }

    [Fact]
    public void Check_WhenStartIsInsideTheLeadTime_ReturnsValidationError()
    {
        var policy = DefaultPolicy with { MinLeadTimeMinutes = 120 };

        var error = policy.Check(Now.AddMinutes(119), Now.AddHours(3), Now);

        Assert.Equal(ServiceErrorKind.Validation, error?.Kind);
        Assert.Equal("Bookings must be made at least 2 hours in advance.", error?.Message);
        Assert.Null(policy.Check(Now.AddMinutes(120), Now.AddHours(3), Now));
    }

    [Fact]
    public void Check_AllowsBookingsThatEndByTheEndOfTheLastBookableDay()
    {
        // 90 days after 1 January 2030 is 1 April, so bookings can end at midnight that night.
        var lastDayEnd = new DateTime(2030, 4, 2, 0, 0, 0);

        Assert.Equal(lastDayEnd, DefaultPolicy.GetLatestEnd(Now));
        Assert.Null(DefaultPolicy.Check(lastDayEnd.AddHours(-1), lastDayEnd, Now));
        Assert.Equal(
            "Bookings can be made up to 90 days ahead.",
            DefaultPolicy.Check(lastDayEnd.AddMinutes(-45), lastDayEnd.AddMinutes(15), Now)?.Message);
    }

    [Theory]
    [InlineData(14, "Bookings must be at least 15 minutes long.")]
    [InlineData(15, null)]
    [InlineData(480, null)]
    [InlineData(481, "Bookings can be at most 8 hours long.")]
    public void Check_EnforcesTheDurationLimits(int minutes, string? expectedMessage)
    {
        var start = Now.AddDays(1);

        var error = DefaultPolicy.Check(start, start.AddMinutes(minutes), Now);

        Assert.Equal(expectedMessage, error?.Message);
    }

    [Theory]
    [InlineData(15, 480, 0, 90, true)]
    [InlineData(600, 480, 0, 90, false)]
    // Two days' notice plus the shortest booking can't fit in one day ahead.
    [InlineData(15, 480, 2880, 1, false)]
    // One day ahead always includes the whole of tomorrow, whatever the time now.
    [InlineData(15, 480, 1425, 1, true)]
    [InlineData(15, 480, 1426, 1, false)]
    public void CanBeMet_IsFalseForRulesNoBookingCouldFollow(
        int minDuration,
        int maxDuration,
        int leadTime,
        int advanceDays,
        bool expected)
    {
        Assert.Equal(expected, new BookingPolicy(minDuration, maxDuration, leadTime, advanceDays).CanBeMet);
    }

    [Fact]
    public void Options_WhenNoticeAndShortestBookingDontFitInTheHorizon_AreInvalid()
    {
        var options = new BookingPolicyOptions { MinLeadTimeMinutes = 2880, MaxAdvanceDays = 1 };

        var result = Assert.Single(Validate(options));
        Assert.Equal(
            "BookingPolicy:MinLeadTimeMinutes plus BookingPolicy:MinDurationMinutes must fit within BookingPolicy:MaxAdvanceDays.",
            result.ErrorMessage);
    }

    [Theory]
    [InlineData(0, "0 minutes")]
    [InlineData(1, "1 minute")]
    [InlineData(15, "15 minutes")]
    [InlineData(60, "1 hour")]
    [InlineData(90, "1 hour 30 minutes")]
    [InlineData(480, "8 hours")]
    [InlineData(1440, "1 day")]
    [InlineData(2880, "2 days")]
    [InlineData(1500, "25 hours")]
    public void FormatMinutes_ReadsNaturally(int minutes, string expected)
    {
        Assert.Equal(expected, BookingPolicy.FormatMinutes(minutes));
    }

    private static List<ValidationResult> Validate(BookingPolicyOptions options)
    {
        var results = new List<ValidationResult>();
        Validator.TryValidateObject(options, new ValidationContext(options), results, validateAllProperties: true);

        return results;
    }
}
