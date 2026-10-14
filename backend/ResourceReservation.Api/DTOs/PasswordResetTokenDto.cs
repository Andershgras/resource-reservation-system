using System.ComponentModel.DataAnnotations;

namespace ResourceReservation.Api.DTOs;

public class PasswordResetTokenDto
{
    [Required(ErrorMessage = "This link is incomplete. Open the link from the email again.")]
    public string Token { get; set; } = string.Empty;
}

// Whether a reset link still works, and whether it sets up an unconfirmed
// account again, in which case the page also asks for a name.
public class PasswordResetTokenStatusDto
{
    public bool CompletesRegistration { get; set; }
}
