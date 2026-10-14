using System.ComponentModel.DataAnnotations;
using System.Net.Mail;

namespace ResourceReservation.Api.Configuration;

// How emails are delivered. Only the development pickup directory exists for
// now; a real provider is configured in Milestone 7. There is no default, so
// the API won't start somewhere emails would silently go nowhere.
public class EmailOptions : IValidatableObject
{
    public const string SectionName = "Email";

    public const string PickupDirectoryDelivery = "PickupDirectory";

    [Required(ErrorMessage = "Email:Delivery is required. The only option for now is PickupDirectory.")]
    [AllowedValues(PickupDirectoryDelivery, ErrorMessage = "Email:Delivery must be PickupDirectory.")]
    public string? Delivery { get; set; }

    // Each email is written here as an .eml file. Relative to the API's folder.
    public string? PickupDirectory { get; set; }

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
    }
}
