using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.Services;

namespace ResourceReservation.Api.Controllers;

// User accounts. These are the only endpoints that change a role or whether an
// account is active.
[Authorize(Roles = "Admin")]
[ApiController]
[Route("api/[controller]")]
public class UsersController : ControllerBase
{
    private readonly UserService _userService;

    public UsersController(UserService userService)
    {
        _userService = userService;
    }

    [HttpGet]
    public Task<UserAccountPageResponseDto> GetUsers(
        [FromQuery][StringLength(100, ErrorMessage = "Search text must be 100 characters or fewer.")] string? search,
        [FromQuery][Range(1, int.MaxValue, ErrorMessage = "Page must be 1 or more.")] int page = 1,
        [FromQuery][Range(1, UserService.MaxPageSize, ErrorMessage = "Page size must be between 1 and 100.")] int pageSize = 25)
    {
        return _userService.GetPageAsync(search, page, pageSize);
    }

    [HttpPut("{id}/role")]
    public async Task<ActionResult<UserAccountResponseDto>> ChangeRole(int id, ChangeUserRoleDto request)
    {
        if (User.GetCurrentUser() is not { } currentUser)
        {
            return this.AuthenticationRequired();
        }

        var result = await _userService.ChangeRoleAsync(currentUser, id, request.Role!);

        return result.IsSuccess ? Ok(result.Value) : this.ToErrorResult(result.Error);
    }

    [HttpPut("{id}/status")]
    public async Task<ActionResult<UserAccountResponseDto>> ChangeStatus(int id, ChangeUserStatusDto request)
    {
        if (User.GetCurrentUser() is not { } currentUser)
        {
            return this.AuthenticationRequired();
        }

        var result = await _userService.ChangeStatusAsync(currentUser, id, request.IsActive!.Value);

        return result.IsSuccess ? Ok(result.Value) : this.ToErrorResult(result.Error);
    }
}
