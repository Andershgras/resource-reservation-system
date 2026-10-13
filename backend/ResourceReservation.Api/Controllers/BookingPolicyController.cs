using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using ResourceReservation.Api.Configuration;
using ResourceReservation.Api.DTOs;

namespace ResourceReservation.Api.Controllers;

// The default booking rules, which resources use unless they override them.
[Authorize]
[ApiController]
[Route("api/[controller]")]
public class BookingPolicyController : ControllerBase
{
    private readonly BookingPolicyOptions _bookingPolicyOptions;

    public BookingPolicyController(IOptions<BookingPolicyOptions> bookingPolicyOptions)
    {
        _bookingPolicyOptions = bookingPolicyOptions.Value;
    }

    [HttpGet]
    public BookingPolicyResponseDto GetDefaults()
    {
        return new BookingPolicyResponseDto
        {
            MinDurationMinutes = _bookingPolicyOptions.MinDurationMinutes,
            MaxDurationMinutes = _bookingPolicyOptions.MaxDurationMinutes,
            MinLeadTimeMinutes = _bookingPolicyOptions.MinLeadTimeMinutes,
            MaxAdvanceDays = _bookingPolicyOptions.MaxAdvanceDays,
            MaxActiveReservationsPerUser = _bookingPolicyOptions.MaxActiveReservationsPerUser
        };
    }
}
