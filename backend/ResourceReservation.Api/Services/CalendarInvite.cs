using System.Globalization;
using System.Text;

namespace ResourceReservation.Api.Services;

// An iCalendar (RFC 5545) invitation for one booking, sent as an iTIP
// (RFC 5546) REQUEST when it is made or moved and CANCEL when it is cancelled.
// Every message about a booking has the same UID and a higher SEQUENCE, so a
// calendar updates or removes the event it already has. Times are UTC, so the
// file needs no time zone definitions.
public sealed record CalendarInvite(
    string Uid,
    int Sequence,
    bool IsCancellation,
    DateTimeOffset Stamp,
    DateTime StartUtc,
    DateTime EndUtc,
    string Summary,
    string? Location,
    string Description,
    string OrganizerName,
    string OrganizerEmail,
    string AttendeeName,
    string AttendeeEmail)
{
    public string Method => IsCancellation ? "CANCEL" : "REQUEST";

    public string ContentType => $"text/calendar; method={Method}; charset=UTF-8";

    public string ToICalendar()
    {
        var lines = new List<string>
        {
            "BEGIN:VCALENDAR",
            "PRODID:-//Resource Reservation System//Bookings//EN",
            "VERSION:2.0",
            "CALSCALE:GREGORIAN",
            $"METHOD:{Method}",
            "BEGIN:VEVENT",
            $"UID:{Uid}",
            $"SEQUENCE:{Sequence}",
            $"DTSTAMP:{FormatUtc(Stamp.UtcDateTime)}",
            $"DTSTART:{FormatUtc(StartUtc)}",
            $"DTEND:{FormatUtc(EndUtc)}",
            $"SUMMARY:{EscapeText(Summary)}"
        };

        if (!string.IsNullOrWhiteSpace(Location))
        {
            lines.Add($"LOCATION:{EscapeText(Location)}");
        }

        lines.Add($"DESCRIPTION:{EscapeText(Description)}");
        lines.Add($"ORGANIZER;CN={QuoteParameter(OrganizerName)}:mailto:{OrganizerEmail}");
        lines.Add(
            $"ATTENDEE;CN={QuoteParameter(AttendeeName)};ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:{AttendeeEmail}");
        lines.Add(IsCancellation ? "STATUS:CANCELLED" : "STATUS:CONFIRMED");
        lines.Add("TRANSP:OPAQUE");
        lines.Add("END:VEVENT");
        lines.Add("END:VCALENDAR");

        return string.Concat(lines.Select(line => Fold(line) + "\r\n"));
    }

    private static string FormatUtc(DateTime utc)
    {
        return utc.ToString("yyyyMMdd'T'HHmmss'Z'", CultureInfo.InvariantCulture);
    }

    // TEXT values escape backslashes, semicolons, commas and line breaks.
    private static string EscapeText(string value)
    {
        return value
            .Replace("\\", "\\\\")
            .Replace(";", "\\;")
            .Replace(",", "\\,")
            .Replace("\r\n", "\\n")
            .Replace("\n", "\\n")
            .Replace("\r", "\\n");
    }

    // Parameter values can't contain quotes or line breaks, and are quoted.
    private static string QuoteParameter(string value)
    {
        var cleaned = new string(value.Where(character => character is not ('"' or '\r' or '\n')).ToArray());

        return $"\"{cleaned}\"";
    }

    // Lines longer than 75 octets continue on the next line after a space,
    // without splitting a UTF-8 character.
    private static string Fold(string line)
    {
        var result = new StringBuilder();
        var octets = 0;
        var limit = 75;

        foreach (var rune in line.EnumerateRunes())
        {
            var size = rune.Utf8SequenceLength;

            if (octets + size > limit)
            {
                result.Append("\r\n ");
                octets = 0;
                limit = 74;
            }

            result.Append(rune.ToString());
            octets += size;
        }

        return result.ToString();
    }
}
