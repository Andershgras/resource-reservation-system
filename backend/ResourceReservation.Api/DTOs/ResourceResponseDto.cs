namespace ResourceReservation.Api.DTOs;

public class ResourceResponseDto
{
    public int Id { get; set; }

    public string Name { get; set; } = string.Empty;

    public string? Description { get; set; }

    public string? Location { get; set; }

    public bool IsActive { get; set; }

    // Null where the resource uses the default booking rule.
    public int? MinDurationMinutes { get; set; }

    public int? MaxDurationMinutes { get; set; }

    public int? MinLeadTimeMinutes { get; set; }

    public int? MaxAdvanceDays { get; set; }
}
