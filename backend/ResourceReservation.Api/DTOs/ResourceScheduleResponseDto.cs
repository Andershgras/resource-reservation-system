namespace ResourceReservation.Api.DTOs;

public class ResourceScheduleResponseDto
{
    public int ResourceId { get; set; }
    public string ResourceName { get; set; } = string.Empty;
    public DateOnly FromDate { get; set; }
    public DateOnly ToDate { get; set; }
    public List<BookableSlotResponseDto> BookableSlots { get; set; } = [];
    public List<ReservedSlotResponseDto> ReservedSlots { get; set; } = [];
}
