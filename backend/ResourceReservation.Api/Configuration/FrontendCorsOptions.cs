using System.ComponentModel.DataAnnotations;

namespace ResourceReservation.Api.Configuration;

// Browser origins allowed to call the API from another origin, such as a
// frontend on its own domain. Leave empty when the frontend and the API are
// served from the same origin. Development also allows the local Vite ports.
public class FrontendCorsOptions : IValidatableObject
{
    public const string SectionName = "Cors";

    public string[] AllowedOrigins { get; set; } = [];

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        foreach (var origin in AllowedOrigins)
        {
            if (!IsPlainOrigin(origin))
            {
                yield return new ValidationResult(
                    $"Cors:AllowedOrigins entry '{origin}' must be an origin such as " +
                    "'https://app.example.com', with no path, query or wildcard.",
                    [nameof(AllowedOrigins)]);
            }
        }
    }

    public bool IsAllowed(string origin)
    {
        return AllowedOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase);
    }

    // The value must be exactly what a browser sends in the Origin header.
    private static bool IsPlainOrigin(string origin)
    {
        return Uri.TryCreate(origin, UriKind.Absolute, out var uri) &&
            (uri.Scheme == Uri.UriSchemeHttps || uri.Scheme == Uri.UriSchemeHttp) &&
            string.Equals(uri.GetLeftPart(UriPartial.Authority), origin, StringComparison.OrdinalIgnoreCase) &&
            !origin.Contains('*');
    }
}
