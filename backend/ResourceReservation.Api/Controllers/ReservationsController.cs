using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.Services;

namespace ResourceReservation.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/[controller]")]
public class ReservationsController : ControllerBase
{
    private readonly ReservationService _reservationService;

    public ReservationsController(ReservationService reservationService)
    {
        _reservationService = reservationService;
    }

    [HttpGet]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<IEnumerable<ReservationResponseDto>>> GetReservations()
    {
        return await _reservationService.GetAllAsync();
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<ReservationResponseDto>> GetReservation(int id)
    {
        if (User.GetCurrentUser() is not { } currentUser)
        {
            return this.AuthenticationRequired();
        }

        var result = await _reservationService.GetAsync(id, currentUser);

        return result.IsSuccess ? Ok(result.Value) : this.ToErrorResult(result.Error);
    }

    [HttpGet("me")]
    public async Task<ActionResult<IEnumerable<ReservationResponseDto>>> GetMyReservations()
    {
        if (User.GetCurrentUser() is not { } currentUser)
        {
            return this.AuthenticationRequired();
        }

        return await _reservationService.GetForUserAsync(currentUser.UserId);
    }

    [HttpPost]
    public async Task<ActionResult<ReservationResponseDto>> CreateReservation(CreateReservationDto createReservationDto)
    {
        if (User.GetCurrentUser() is not { } currentUser)
        {
            return this.AuthenticationRequired();
        }

        var result = await _reservationService.CreateAsync(createReservationDto, currentUser.UserId);

        if (!result.IsSuccess)
        {
            return this.ToErrorResult(result.Error);
        }

        return CreatedAtAction(nameof(GetReservation), new { id = result.Value.Id }, result.Value);
    }

    [HttpPut("{id}/cancel")]
    public async Task<IActionResult> CancelReservation(int id)
    {
        if (User.GetCurrentUser() is not { } currentUser)
        {
            return this.AuthenticationRequired();
        }

        var result = await _reservationService.CancelAsync(id, currentUser);

        return result.IsSuccess ? NoContent() : this.ToErrorResult(result.Error);
    }

    [HttpGet("resource/{resourceId}")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<IEnumerable<ReservationResponseDto>>> GetReservationsByResource(int resourceId)
    {
        var result = await _reservationService.GetForResourceAsync(resourceId);

        return result.IsSuccess ? result.Value : this.ToErrorResult(result.Error);
    }

    [HttpGet("user/{userId}")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<IEnumerable<ReservationResponseDto>>> GetReservationsByUser(int userId)
    {
        return await _reservationService.GetForUserAsync(userId);
    }
}
