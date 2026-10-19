using System.ComponentModel.DataAnnotations;

namespace ResourceReservation.Api.Configuration;

// Where the frontend runs, for the links in emails.
public class FrontendOptions : IValidatableObject
{
    public const string SectionName = "Frontend";

    [Required(ErrorMessage = "Frontend:BaseUrl is required.")]
    public string BaseUrl { get; set; } = string.Empty;

    // A link to a frontend page, such as "/reset-password".
    public string LinkTo(string path, string? fragment = null)
    {
        var link = BaseUrl.TrimEnd('/') + path;

        return fragment is null ? link : $"{link}#{fragment}";
    }

    // Scheme, host and port, such as "https://app.example.com", as browsers send
    // it in the Origin header. Empty while BaseUrl is invalid, which stops the
    // API from starting anyway. Validation reads every property, so this must
    // not throw.
    public string Origin => Uri.TryCreate(BaseUrl, UriKind.Absolute, out var uri)
        ? uri.GetLeftPart(UriPartial.Authority)
        : string.Empty;

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (!string.IsNullOrWhiteSpace(BaseUrl) &&
            (!Uri.TryCreate(BaseUrl, UriKind.Absolute, out var uri) ||
                (uri.Scheme != Uri.UriSchemeHttps && uri.Scheme != Uri.UriSchemeHttp) ||
                !string.IsNullOrEmpty(uri.Query) ||
                !string.IsNullOrEmpty(uri.Fragment)))
        {
            yield return new ValidationResult(
                $"Frontend:BaseUrl '{BaseUrl}' must be an absolute http or https URL without a query or fragment.",
                [nameof(BaseUrl)]);
        }
    }
}
