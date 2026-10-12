using System.ComponentModel.DataAnnotations;

namespace ResourceReservation.Api.Configuration;

// Optional. When an email is configured, an Admin user is created on startup
// if no Admin exists yet.
public class SeedAdminOptions : IValidatableObject
{
    public const string SectionName = "SeedAdmin";

    public string? Name { get; set; }

    public string? Email { get; set; }

    public string? Password { get; set; }

    public bool IsConfigured => !string.IsNullOrWhiteSpace(Email);

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (!IsConfigured)
        {
            yield break;
        }

        if (string.IsNullOrWhiteSpace(Password) || Password.Length < 8)
        {
            yield return new ValidationResult(
                "SeedAdmin:Password must be at least 8 characters when SeedAdmin:Email is set.",
                [nameof(Password)]);
        }
    }
}
