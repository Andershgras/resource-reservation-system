using System.ComponentModel.DataAnnotations;

namespace ResourceReservation.Api.DTOs;

public class CreateAvailabilityRuleDto
{
    [Range(1, int.MaxValue, ErrorMessage = "Select a resource.")]
    public int ResourceId { get; set; }

    [Range(0, 6, ErrorMessage = "Select a weekday.")]
    public int DayOfWeek { get; set; }

    public TimeOnly StartTime { get; set; }

    public TimeOnly EndTime { get; set; }
}
