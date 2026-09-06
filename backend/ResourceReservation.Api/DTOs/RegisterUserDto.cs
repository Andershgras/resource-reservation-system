using System.ComponentModel.DataAnnotations;

namespace ResourceReservation.Api.DTOs;

public class RegisterUserDto
{
    [Required]
    [StringLength(100)]
    public string Name { get; set; } = string.Empty;

    [Required]
    [EmailAddress]
    [StringLength(255)]
    public string Email { get; set; } = string.Empty;

    [Required]
    [MinLength(8)]
    [StringLength(100)]
    public string Password { get; set; } = string.Empty;
}
