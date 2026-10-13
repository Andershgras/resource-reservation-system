namespace ResourceReservation.Api.Models;

public class Resource
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; } = string.Empty;
    public string? Location { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;

    // Booking rule overrides. Null means the resource uses the default from
    // the BookingPolicy configuration section.
    public int? MinDurationMinutes { get; set; }
    public int? MaxDurationMinutes { get; set; }
    public int? MinLeadTimeMinutes { get; set; }
    public int? MaxAdvanceDays { get; set; }
}
