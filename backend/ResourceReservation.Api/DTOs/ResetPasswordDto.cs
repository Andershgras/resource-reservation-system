using System.ComponentModel.DataAnnotations;

namespace ResourceReservation.Api.DTOs;

public class ResetPasswordDto
{
    [Required(ErrorMessage = "This link is incomplete. Open the link from the email again.")]
    public string Token { get; set; } = string.Empty;

    [Required(ErrorMessage = "Enter a new password.")]
    [MinLength(8, ErrorMessage = "Password must be at least 8 characters.")]
    [StringLength(100, ErrorMessage = "Password must be 100 characters or fewer.")]
    public string Password { get; set; } = string.Empty;

    // Required only when the reset sets up an unconfirmed account again.
    [StringLength(100, ErrorMessage = "Name must be 100 characters or fewer.")]
    public string? Name { get; set; }
}
