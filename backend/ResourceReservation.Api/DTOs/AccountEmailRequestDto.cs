using System.ComponentModel.DataAnnotations;

namespace ResourceReservation.Api.DTOs;

// Asks for an email to be sent to an address: a new verification link or a
// password reset link.
public class AccountEmailRequestDto
{
    [Required(ErrorMessage = "Enter your email address.")]
    [EmailAddress(ErrorMessage = "Enter a valid email address.")]
    [StringLength(255, ErrorMessage = "Email must be 255 characters or fewer.")]
    public string Email { get; set; } = string.Empty;
}
