namespace ResourceReservation.Api.DTOs;

public class AvailabilityRuleResponseDto
{
    public int Id { get; set; }
    public int ResourceId { get; set; }
    public string ResourceName { get; set; } = string.Empty;
    public int DayOfWeek { get; set; }
    public string DayName { get; set; } = string.Empty;
    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }
}
