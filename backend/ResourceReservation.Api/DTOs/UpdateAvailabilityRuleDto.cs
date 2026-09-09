using System.ComponentModel.DataAnnotations;

namespace ResourceReservation.Api.DTOs;

public class UpdateAvailabilityRuleDto
{
    [Range(1, int.MaxValue)]
    public int ResourceId { get; set; }

    [Range(0, 6)]
    public int DayOfWeek { get; set; }

    public TimeOnly StartTime { get; set; }

    public TimeOnly EndTime { get; set; }
}
