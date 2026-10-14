namespace ResourceReservation.Api.DTOs;

public class UserAccountPageResponseDto
{
    public List<UserAccountResponseDto> Items { get; set; } = [];

    // Matching accounts across all pages.
    public int TotalCount { get; set; }

    public int Page { get; set; }

    public int PageSize { get; set; }
}
