namespace ResourceReservation.Api.DTOs;

public class CreateResourceDto
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? Location { get; set; }
}
