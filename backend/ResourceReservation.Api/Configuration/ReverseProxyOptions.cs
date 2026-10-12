using System.ComponentModel.DataAnnotations;
using System.Net;

namespace ResourceReservation.Api.Configuration;

// The reverse proxies in front of the API, such as nginx or a hosting platform's
// load balancer. X-Forwarded-For and X-Forwarded-Proto are trusted only from
// these addresses. With none configured, forwarded headers are ignored, so a
// client can't fake its IP address or scheme.
public class ReverseProxyOptions : IValidatableObject
{
    public const string SectionName = "ReverseProxy";

    // Single addresses, such as "10.0.0.5".
    public string[] KnownProxies { get; set; } = [];

    // Address ranges in CIDR notation, such as "10.0.0.0/8".
    public string[] KnownNetworks { get; set; } = [];

    public bool IsConfigured => KnownProxies.Length > 0 || KnownNetworks.Length > 0;

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        foreach (var proxy in KnownProxies.Where(proxy => !IPAddress.TryParse(proxy, out _)))
        {
            yield return new ValidationResult(
                $"ReverseProxy:KnownProxies entry '{proxy}' is not an IP address.",
                [nameof(KnownProxies)]);
        }

        foreach (var network in KnownNetworks.Where(network => !IPNetwork.TryParse(network, out _)))
        {
            yield return new ValidationResult(
                $"ReverseProxy:KnownNetworks entry '{network}' is not a CIDR range such as '10.0.0.0/8'.",
                [nameof(KnownNetworks)]);
        }
    }
}
