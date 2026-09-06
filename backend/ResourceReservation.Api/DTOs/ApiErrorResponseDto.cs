namespace ResourceReservation.Api.DTOs;

public class ApiErrorResponseDto
{
    public required string Message { get; init; }

    public Dictionary<string, string[]>? Errors { get; init; }
}
