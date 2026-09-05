namespace ResourceReservation.Api.DTOs;

public class AvailabilityResponseDto
{
    public int Id { get; set; }
    public int ResourceId { get; set; }
    public string ResourceName { get; set; } = string.Empty;
    public DateTime StartTime { get; set; }
    public DateTime EndTime { get; set; }
}