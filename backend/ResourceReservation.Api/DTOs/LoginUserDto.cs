using System.ComponentModel.DataAnnotations;

namespace ResourceReservation.Api.DTOs;

public class LoginUserDto
{
    [Required]
    [EmailAddress]
    [StringLength(255)]
    public string Email { get; set; } = string.Empty;

    [Required]
    public string Password { get; set; } = string.Empty;
}
