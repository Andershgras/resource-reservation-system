using Microsoft.AspNetCore.Mvc;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.Services;

namespace ResourceReservation.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly AuthService _authService;

    public AuthController(AuthService authService)
    {
        _authService = authService;
    }

    [HttpPost("register")]
    public async Task<ActionResult<UserResponseDto>> Register(RegisterUserDto registerUserDto)
    {
        var result = await _authService.RegisterAsync(registerUserDto);

        if (!result.IsSuccess)
        {
            return this.ToErrorResult(result.Error);
        }

        return CreatedAtAction(nameof(Register), new { id = result.Value.Id }, result.Value);
    }

    [HttpPost("login")]
    public async Task<ActionResult<AuthResponseDto>> Login(LoginUserDto loginUserDto)
    {
        var result = await _authService.LoginAsync(loginUserDto);

        return result.IsSuccess ? Ok(result.Value) : this.ToErrorResult(result.Error);
    }
}
