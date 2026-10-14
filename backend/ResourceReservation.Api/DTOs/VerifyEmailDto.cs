using System.ComponentModel.DataAnnotations;

namespace ResourceReservation.Api.DTOs;

// Confirming an address needs the link's token and the account's password, so
// someone who registered another person's address can't have that person
// activate it by clicking the link (ADR 0011).
public class VerifyEmailDto
{
    [Required(ErrorMessage = "This link is incomplete. Open the link from the email again.")]
    public string Token { get; set; } = string.Empty;

    [Required(ErrorMessage = "Enter your password.")]
    public string Password { get; set; } = string.Empty;
}
