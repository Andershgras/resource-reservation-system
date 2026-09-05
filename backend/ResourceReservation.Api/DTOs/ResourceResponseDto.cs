namespace ResourceReservation.Api.DTOs;

public class ResourceResponseDto
{
    public int Id { get; set; }

    public string Name { get; set; } = string.Empty;

    public string? Description { get; set; }

    public string? Location { get; set; }

    public bool IsActive { get; set; }
}
