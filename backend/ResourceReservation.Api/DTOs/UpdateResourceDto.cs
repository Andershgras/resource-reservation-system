using System.ComponentModel.DataAnnotations;

namespace ResourceReservation.Api.DTOs;

public class UpdateResourceDto
{
    [Required]
    [StringLength(100)]
    public string Name { get; set; } = string.Empty;

    [StringLength(500)]
    public string? Description { get; set; }

    [StringLength(200)]
    public string? Location { get; set; }

    public bool IsActive { get; set; }
}
