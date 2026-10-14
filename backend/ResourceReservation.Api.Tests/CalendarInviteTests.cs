using System.Text;
using Microsoft.Extensions.Options;
using ResourceReservation.Api.Configuration;
using ResourceReservation.Api.Models;
using ResourceReservation.Api.Services;

namespace ResourceReservation.Api.Tests;

// Calendar invitations: Copenhagen wall-clock times as UTC, including both
// daylight-saving changes, and the iCalendar format (ADR 0011).
public class CalendarInviteTests
{
    [Theory]
    // Winter, UTC+1.
    [InlineData("2030-01-16T09:00", "2030-01-16T08:00")]
    // Summer, UTC+2.
    [InlineData("2030-07-10T09:00", "2030-07-10T07:00")]
    // Spring forward on Sunday 31 March 2030: 02:00 becomes 03:00.
    [InlineData("2030-03-31T01:59", "2030-03-31T00:59")]
    [InlineData("2030-03-31T03:00", "2030-03-31T01:00")]
    // 02:30 doesn't exist that night; it lands where the clock jumps to, 03:30 summer time.
    [InlineData("2030-03-31T02:30", "2030-03-31T01:30")]
    // Fall back on Sunday 27 October 2030: 03:00 summer time becomes 02:00 winter time.
    [InlineData("2030-10-27T01:59", "2030-10-26T23:59")]
    [InlineData("2030-10-27T03:00", "2030-10-27T02:00")]
    // 02:30 happens twice that night; the first, in summer time, is used.
    [InlineData("2030-10-27T02:30", "2030-10-27T00:30")]
    public void WallClockTimes_BecomeTheRightUtcInstant(string wallClock, string expectedUtc)
    {
        var utc = TestSchedulingClock.Create().ToUtc(DateTime.Parse(wallClock));

        Assert.Equal(DateTime.Parse(expectedUtc), utc);
        Assert.Equal(DateTimeKind.Utc, utc.Kind);
    }

    [Fact]
    public void TheTestDates_AreTheRealChanges()
    {
        var zone = TestSchedulingClock.TimeZone;

        Assert.True(zone.IsInvalidTime(new DateTime(2030, 3, 31, 2, 30, 0)));
        Assert.True(zone.IsAmbiguousTime(new DateTime(2030, 10, 27, 2, 30, 0)));
    }

    [Fact]
    public void ABookingOverTheAutumnChange_LastsItsRealLength()
    {
        // 00:00–04:00 wall clock that night is five real hours.
        var invite = CreateEmails().CreateInvite(Notification(
            BookingNotificationKinds.Created,
            new DateTime(2030, 10, 27, 0, 0, 0),
            new DateTime(2030, 10, 27, 4, 0, 0)));

        Assert.Equal(TimeSpan.FromHours(5), invite.EndUtc - invite.StartUtc);
        Assert.Contains("DTSTART:20301026T220000Z\r\n", invite.ToICalendar());
        Assert.Contains("DTEND:20301027T030000Z\r\n", invite.ToICalendar());
    }

    [Fact]
    public void ANewBooking_IsARequestToAddAConfirmedEvent()
    {
        var ics = Unfold(CreateEmails().CreateInvite(Notification(BookingNotificationKinds.Created)).ToICalendar());

        Assert.StartsWith("BEGIN:VCALENDAR\r\n", ics);
        Assert.EndsWith("END:VCALENDAR\r\n", ics);
        Assert.Contains("METHOD:REQUEST\r\n", ics);
        Assert.Contains("UID:reservation-42@example.test\r\n", ics);
        Assert.Contains("SEQUENCE:0\r\n", ics);
        Assert.Contains("DTSTAMP:20300110T080000Z\r\n", ics);
        Assert.Contains("STATUS:CONFIRMED\r\n", ics);
        Assert.Contains("ORGANIZER;CN=\"Resource Reservation\":mailto:no-reply@example.test\r\n", ics);
        Assert.Contains("ATTENDEE;CN=\"Ada\";ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:ada@example.test", ics);
        // Every line ends with CRLF, and there are no bare line feeds.
        Assert.DoesNotContain("\n", ics.Replace("\r\n", string.Empty));
    }

    [Fact]
    public void ACancellation_KeepsTheUidAndRaisesTheSequence()
    {
        var emails = CreateEmails();
        var cancellation = emails.CreateInvite(Notification(BookingNotificationKinds.Cancelled, sequence: 3));
        var ics = cancellation.ToICalendar();

        Assert.Equal("text/calendar; method=CANCEL; charset=UTF-8", cancellation.ContentType);
        Assert.Contains("METHOD:CANCEL\r\n", ics);
        Assert.Contains("UID:reservation-42@example.test\r\n", ics);
        Assert.Contains("SEQUENCE:3\r\n", ics);
        Assert.Contains("STATUS:CANCELLED\r\n", ics);
    }

    [Fact]
    public void Text_IsEscaped_AndQuotesCantBreakOutOfAName()
    {
        var notification = Notification(BookingNotificationKinds.Created);
        notification.ResourceName = "Room A; big, with \\ and\nnewline";
        notification.RecipientName = "Ada \"the\" Admin";

        var ics = Unfold(CreateEmails().CreateInvite(notification).ToICalendar());

        Assert.Contains("SUMMARY:Room A\\; big\\, with \\\\ and\\nnewline\r\n", ics);
        Assert.Contains("ATTENDEE;CN=\"Ada the Admin\";", ics);
    }

    [Fact]
    public void LongLines_AreFoldedAt75Octets_WithoutSplittingACharacter()
    {
        var notification = Notification(BookingNotificationKinds.Created);
        notification.ResourceName = string.Concat(Enumerable.Repeat("Mødelokale ", 20));

        var ics = CreateEmails().CreateInvite(notification).ToICalendar();

        Assert.All(ics.Split("\r\n"), line => Assert.InRange(Encoding.UTF8.GetByteCount(line), 0, 75));
        Assert.Contains($"SUMMARY:{notification.ResourceName}\r\n", Unfold(ics));
    }

    [Theory]
    [InlineData("2030-01-16T09:00", "2030-01-16T10:30", "Wed 16 Jan 2030, 09:00–10:30")]
    [InlineData("2030-01-16T22:00", "2030-01-17T02:00", "Wed 16 Jan 2030, 22:00 – Thu 17 Jan 2030, 02:00")]
    public void Periods_AreWrittenInBritishFormat(string start, string end, string expected)
    {
        Assert.Equal(expected, BookingEmails.FormatPeriod(DateTime.Parse(start), DateTime.Parse(end)));
    }

    [Fact]
    public void TheEmail_SaysWhatHappened_AndCarriesTheInvitation()
    {
        var notification = Notification(BookingNotificationKinds.Moved);
        notification.ChangedByAdmin = true;

        var email = CreateEmails().Create(notification);

        Assert.Equal("Booking moved: Room A, Wed 16 Jan 2030, 09:00–10:00", email.Subject);
        Assert.Contains("An administrator moved your booking to a new time.", email.TextBody);
        Assert.Contains("https://app.example.test/my-reservations", email.TextBody);
        Assert.Equal("<booking-notification-7@example.test>", email.MessageId);
        var attachment = Assert.Single(email.Attachments);
        Assert.Equal(("booking.ics", "text/calendar; method=REQUEST; charset=UTF-8"), (attachment.FileName, attachment.ContentType));
    }

    private static string Unfold(string ics) => ics.Replace("\r\n ", string.Empty);

    private static BookingEmails CreateEmails()
    {
        return new BookingEmails(
            Options.Create(new EmailOptions
            {
                Delivery = EmailOptions.PickupDirectoryDelivery,
                PickupDirectory = "unused",
                FromAddress = "no-reply@example.test"
            }),
            Options.Create(new FrontendOptions { BaseUrl = "https://app.example.test" }),
            TestSchedulingClock.Create());
    }

    private static BookingNotification Notification(
        string kind,
        DateTime? start = null,
        DateTime? end = null,
        int sequence = 0)
    {
        return new BookingNotification
        {
            Id = 7,
            ReservationId = 42,
            Kind = kind,
            StartTime = start ?? new DateTime(2030, 1, 16, 9, 0, 0),
            EndTime = end ?? new DateTime(2030, 1, 16, 10, 0, 0),
            CalendarSequence = sequence,
            ResourceName = "Room A",
            ResourceLocation = "Floor 2",
            RecipientName = "Ada",
            RecipientEmail = "ada@example.test",
            CreatedAt = new DateTimeOffset(2030, 1, 10, 8, 0, 0, TimeSpan.Zero)
        };
    }
}
