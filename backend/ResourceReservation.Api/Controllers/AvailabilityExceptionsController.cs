using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.Services;

namespace ResourceReservation.Api.Controllers;

// Closures. Admin only, because previews and results include who booked.
// Everyone sees closed time and its reason through the schedule.
[Authorize(Roles = "Admin")]
[ApiController]
[Route("api/[controller]")]
public class AvailabilityExceptionsController : ControllerBase
{
    private readonly AvailabilityExceptionService _closureService;

    public AvailabilityExceptionsController(AvailabilityExceptionService closureService)
    {
        _closureService = closureService;
    }

    [HttpGet]
    public Task<List<AvailabilityExceptionResponseDto>> GetClosures([FromQuery] int? resourceId)
    {
        return _closureService.GetAllAsync(resourceId);
    }

    // The active reservations the closure would cover. Nothing is saved.
    [HttpPost("preview")]
    public async Task<ActionResult<List<ReservationResponseDto>>> PreviewClosure(
        CreateAvailabilityExceptionDto request)
    {
        var result = await _closureService.PreviewAsync(request);

        return result.IsSuccess ? Ok(result.Value) : this.ToErrorResult(result.Error);
    }

    [HttpPost]
    public async Task<ActionResult<AvailabilityExceptionCreatedDto>> CreateClosure(
        CreateAvailabilityExceptionDto request)
    {
        if (User.GetCurrentUser() is not { } currentUser)
        {
            return this.AuthenticationRequired();
        }

        var result = await _closureService.CreateAsync(request, currentUser.UserId);

        return result.IsSuccess
            ? StatusCode(StatusCodes.Status201Created, result.Value)
            : this.ToErrorResult(result.Error);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteClosure(int id)
    {
        var result = await _closureService.DeleteAsync(id);

        return result.IsSuccess ? NoContent() : this.ToErrorResult(result.Error);
    }
}
