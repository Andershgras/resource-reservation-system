using System.Globalization;
using System.Net;
using System.Net.Mail;
using Microsoft.Extensions.Options;
using ResourceReservation.Api.Configuration;
using ResourceReservation.Api.Models;

namespace ResourceReservation.Api.Services;

// Builds a booking email and its calendar invitation from an outbox entry.
// Only the entry is used, so every attempt builds the same email.
public class BookingEmails
{
    private static readonly CultureInfo DisplayCulture = CultureInfo.GetCultureInfo("en-GB");

    private readonly EmailOptions _email;
    private readonly FrontendOptions _frontend;
    private readonly SchedulingClock _schedulingClock;

    public BookingEmails(
        IOptions<EmailOptions> email,
        IOptions<FrontendOptions> frontend,
        SchedulingClock schedulingClock)
    {
        _email = email.Value;
        _frontend = frontend.Value;
        _schedulingClock = schedulingClock;
    }

    private string Domain => new MailAddress(_email.FromAddress).Host;

    // The same for every email about a booking, so calendars match them up.
    public string CalendarUid(int reservationId) => $"reservation-{reservationId}@{Domain}";

    public EmailMessage Create(BookingNotification notification)
    {
        var when = FormatPeriod(notification.StartTime, notification.EndTime);
        var (subject, headline) = notification.Kind switch
        {
            BookingNotificationKinds.Created => ($"Booking confirmed: {notification.ResourceName}", "Your booking is confirmed."),
            BookingNotificationKinds.Moved => ($"Booking moved: {notification.ResourceName}", notification.ChangedByAdmin
                ? "An administrator moved your booking to a new time."
                : "Your booking has moved to a new time."),
            BookingNotificationKinds.Cancelled => ($"Booking cancelled: {notification.ResourceName}", notification.ChangedByAdmin
                ? "An administrator cancelled your booking."
                : "Your booking is cancelled."),
            _ => throw new InvalidOperationException($"Unknown booking notification kind '{notification.Kind}'.")
        };

        var details = new List<(string Label, string Value)>
        {
            ("Resource", notification.ResourceName),
            ("When", $"{when} (Copenhagen time)")
        };

        if (!string.IsNullOrWhiteSpace(notification.ResourceLocation))
        {
            details.Add(("Where", notification.ResourceLocation));
        }

        var link = _frontend.LinkTo("/my-reservations");
        var calendarNote = notification.Kind == BookingNotificationKinds.Cancelled
            ? "The attached calendar file removes the booking from your calendar."
            : "The attached calendar file adds the booking to your calendar, or updates it there.";
        var text = string.Join("\n",
        [
            $"Hello {notification.RecipientName},",
            "",
            headline,
            "",
            .. details.Select(detail => $"{detail.Label}: {detail.Value}"),
            "",
            calendarNote,
            $"Your reservations: {link}"
        ]);
        var html =
            $"<p>Hello {Encode(notification.RecipientName)},</p>" +
            $"<p>{Encode(headline)}</p>" +
            "<table>" + string.Concat(details.Select(detail =>
                $"<tr><th align=\"left\">{Encode(detail.Label)}</th><td>{Encode(detail.Value)}</td></tr>")) + "</table>" +
            $"<p>{Encode(calendarNote)}</p>" +
            $"<p><a href=\"{Encode(link)}\">Your reservations</a></p>";

        var invite = CreateInvite(notification);

        return new EmailMessage(
            notification.RecipientEmail,
            notification.RecipientName,
            $"{subject}, {when}",
            text,
            html,
            [new EmailAttachment("booking.ics", invite.ContentType, invite.ToICalendar())],
            $"<booking-notification-{notification.Id}@{Domain}>");
    }

    public CalendarInvite CreateInvite(BookingNotification notification)
    {
        return new CalendarInvite(
            CalendarUid(notification.ReservationId),
            notification.CalendarSequence,
            notification.Kind == BookingNotificationKinds.Cancelled,
            notification.CreatedAt,
            _schedulingClock.ToUtc(notification.StartTime),
            _schedulingClock.ToUtc(notification.EndTime),
            notification.ResourceName,
            notification.ResourceLocation,
            $"Booking of {notification.ResourceName}. Manage it at {_frontend.LinkTo("/my-reservations")}",
            _email.FromName,
            _email.FromAddress,
            notification.RecipientName,
            notification.RecipientEmail);
    }

    // "Wed 16 Jan 2030, 09:00–10:00", or both dates when it spans midnight.
    public static string FormatPeriod(DateTime start, DateTime end)
    {
        var startText = start.ToString("ddd d MMM yyyy, HH:mm", DisplayCulture);

        return start.Date == end.Date
            ? $"{startText}–{end.ToString("HH:mm", DisplayCulture)}"
            : $"{startText} – {end.ToString("ddd d MMM yyyy, HH:mm", DisplayCulture)}";
    }

    private static string Encode(string value) => WebUtility.HtmlEncode(value);
}
