using System.ComponentModel.DataAnnotations;

namespace ResourceReservation.Api.DTOs;

public class RegisterUserDto
{
    [Required(ErrorMessage = "Enter your name.")]
    [StringLength(100, ErrorMessage = "Name must be 100 characters or fewer.")]
    public string Name { get; set; } = string.Empty;

    [Required(ErrorMessage = "Enter your email address.")]
    [EmailAddress(ErrorMessage = "Enter a valid email address.")]
    [StringLength(255, ErrorMessage = "Email must be 255 characters or fewer.")]
    public string Email { get; set; } = string.Empty;

    [Required(ErrorMessage = "Enter a password.")]
    [MinLength(8, ErrorMessage = "Password must be at least 8 characters.")]
    [StringLength(100, ErrorMessage = "Password must be 100 characters or fewer.")]
    public string Password { get; set; } = string.Empty;
}
