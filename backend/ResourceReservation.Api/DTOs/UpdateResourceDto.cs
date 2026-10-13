using System.ComponentModel.DataAnnotations;

namespace ResourceReservation.Api.DTOs;

public class UpdateResourceDto
{
    [Required(ErrorMessage = "Enter a resource name.")]
    [StringLength(100, ErrorMessage = "Name must be 100 characters or fewer.")]
    public string Name { get; set; } = string.Empty;

    [StringLength(500, ErrorMessage = "Description must be 500 characters or fewer.")]
    public string? Description { get; set; }

    [StringLength(200, ErrorMessage = "Location must be 200 characters or fewer.")]
    public string? Location { get; set; }

    public bool IsActive { get; set; }
}
