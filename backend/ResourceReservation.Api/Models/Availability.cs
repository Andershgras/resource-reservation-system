namespace ResourceReservation.Api.Models;

public class Availability
{
    public int Id { get; set; }
    public int ResourceId {get; set; }
    public DateTime StartTime { get; set; }
    public DateTime EndTime { get; set; }
    public Resource? Resource { get; set; }
}