namespace ResourceReservation.Api.Models;

public class AvailabilityRule
{
    public int Id { get; set; }
    public int ResourceId { get; set; }
    public DayOfWeek DayOfWeek { get; set; }
    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }
    public Resource? Resource { get; set; }
}
