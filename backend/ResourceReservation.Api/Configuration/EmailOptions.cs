using System.ComponentModel.DataAnnotations;
using System.Net;
using System.Net.Mail;
using System.Net.Sockets;

namespace ResourceReservation.Api.Configuration;

// How emails are delivered: through an SMTP server, or written to a folder for
// development. There is no default, so the API won't start somewhere emails
// would silently go nowhere.
public class EmailOptions : IValidatableObject
{
    public const string SectionName = "Email";

    public const string PickupDirectoryDelivery = "PickupDirectory";
    public const string SmtpDelivery = "Smtp";

    [Required(ErrorMessage = "Email:Delivery is required: Smtp, or PickupDirectory for development.")]
    [AllowedValues(SmtpDelivery, PickupDirectoryDelivery, ErrorMessage = "Email:Delivery must be Smtp or PickupDirectory.")]
    public string? Delivery { get; set; }

    // Each email is written here as an .eml file. Relative to the API's folder.
    public string? PickupDirectory { get; set; }

    public SmtpOptions Smtp { get; set; } = new();

    [Required(ErrorMessage = "Email:FromAddress is required.")]
    public string FromAddress { get; set; } = string.Empty;

    public string FromName { get; set; } = "Resource Reservation";

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (!string.IsNullOrWhiteSpace(FromAddress) && !MailAddress.TryCreate(FromAddress, out _))
        {
            yield return new ValidationResult(
                $"Email:FromAddress '{FromAddress}' is not an email address.",
                [nameof(FromAddress)]);
        }

        if (Delivery == PickupDirectoryDelivery && string.IsNullOrWhiteSpace(PickupDirectory))
        {
            yield return new ValidationResult(
                "Email:PickupDirectory is required when Email:Delivery is PickupDirectory.",
                [nameof(PickupDirectory)]);
        }

        if (Delivery == SmtpDelivery)
        {
            foreach (var result in Smtp.Validate())
            {
                yield return result;
            }
        }
    }
}

// The SMTP server for Email:Delivery=Smtp. Connections use TLS: STARTTLS by
// default, or TLS from the start. A server that doesn't offer STARTTLS, or a
// certificate that doesn't check out, means no email is sent; it never falls
// back to plain text.
//
// Plain text (Security=None) is for a local test mail catcher such as Mailpit
// only. It needs AllowInsecureConnection=true as well, and the host must be
// local: localhost, a loopback or private address, or a single-label name such
// as a Docker Compose service. Anything else stops the API at startup.
public class SmtpOptions
{
    public const string StartTls = "StartTls";
    public const string SslOnConnect = "SslOnConnect";
    public const string None = "None";

    public string? Host { get; set; }

    public int Port { get; set; } = 587;

    public string Security { get; set; } = StartTls;

    public bool AllowInsecureConnection { get; set; }

    // Both, or neither for a server that needs no sign-in.
    public string? Username { get; set; }

    public string? Password { get; set; }

    public bool IsInsecure => Security == None;

    public IEnumerable<ValidationResult> Validate()
    {
        if (string.IsNullOrWhiteSpace(Host))
        {
            yield return new ValidationResult(
                "Email:Smtp:Host is required when Email:Delivery is Smtp.",
                [nameof(Host)]);
        }

        if (Port is < 1 or > 65535)
        {
            yield return new ValidationResult("Email:Smtp:Port must be between 1 and 65535.", [nameof(Port)]);
        }

        if (Security is not (StartTls or SslOnConnect or None))
        {
            yield return new ValidationResult(
                "Email:Smtp:Security must be StartTls, SslOnConnect or None.",
                [nameof(Security)]);
        }

        if (string.IsNullOrEmpty(Username) != string.IsNullOrEmpty(Password))
        {
            yield return new ValidationResult(
                "Email:Smtp:Username and Email:Smtp:Password must be set together.",
                [nameof(Username), nameof(Password)]);
        }

        if (Security == None)
        {
            if (!AllowInsecureConnection)
            {
                yield return new ValidationResult(
                    "Email:Smtp:Security None sends email unencrypted. It is only for a local test mail " +
                    "catcher, and needs Email:Smtp:AllowInsecureConnection=true.",
                    [nameof(Security)]);
            }
            else if (!string.IsNullOrWhiteSpace(Host) && !IsLocalHost(Host))
            {
                yield return new ValidationResult(
                    $"Email:Smtp:Security None is only allowed for a local host, not '{Host}'. Use StartTls or SslOnConnect.",
                    [nameof(Host)]);
            }

            if (!string.IsNullOrEmpty(Password))
            {
                yield return new ValidationResult(
                    "Email:Smtp:Password can't be used with Security None, because it would be sent unencrypted.",
                    [nameof(Password)]);
            }
        }
    }

    // localhost, a loopback or private IP address, or a name without dots,
    // which only resolves on a local network, such as "mailpit" in Compose.
    public static bool IsLocalHost(string host)
    {
        if (string.Equals(host, "localhost", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (IPAddress.TryParse(host, out var address))
        {
            return IPAddress.IsLoopback(address) || IsPrivate(address);
        }

        return !host.Contains('.') && Uri.CheckHostName(host) == UriHostNameType.Dns;
    }

    private static bool IsPrivate(IPAddress address)
    {
        if (address.AddressFamily == AddressFamily.InterNetworkV6)
        {
            return address.IsIPv6UniqueLocal || address.IsIPv6LinkLocal;
        }

        var bytes = address.GetAddressBytes();

        return bytes[0] == 10 ||
            (bytes[0] == 172 && bytes[1] is >= 16 and <= 31) ||
            (bytes[0] == 192 && bytes[1] == 168);
    }
}
