using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using ResourceReservation.Api.Configuration;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.Services;

namespace ResourceReservation.Api.Controllers;

// Requests that send email use the stricter email rate limit; the rest share
// the sign-in limit.
[ApiController]
[Route("api/[controller]")]
[EnableRateLimiting(AuthRateLimiting.PolicyName)]
public class AuthController : ControllerBase
{
    private readonly AuthService _authService;
    private readonly AccountService _accountService;

    public AuthController(AuthService authService, AccountService accountService)
    {
        _authService = authService;
        _accountService = accountService;
    }

    // Always 202 with the same message for a valid request, whether or not the
    // address already has an account (ADR 0011).
    [HttpPost("register")]
    [EnableRateLimiting(AuthRateLimiting.EmailPolicyName)]
    public async Task<ActionResult<AcceptedMessageDto>> Register(RegisterUserDto registerUserDto)
    {
        var result = await _accountService.RegisterAsync(registerUserDto);

        return result.IsSuccess ? Accepted(result.Value) : this.ToErrorResult(result.Error);
    }

    [HttpPost("login")]
    public async Task<ActionResult<AuthResponseDto>> Login(LoginUserDto loginUserDto)
    {
        var result = await _authService.LoginAsync(loginUserDto);

        return result.IsSuccess ? Ok(result.Value) : this.ToErrorResult(result.Error);
    }

    [HttpPost("resend-verification")]
    [EnableRateLimiting(AuthRateLimiting.EmailPolicyName)]
    public async Task<ActionResult<AcceptedMessageDto>> ResendVerification(AccountEmailRequestDto request)
    {
        return Accepted(await _accountService.ResendVerificationAsync(request));
    }

    [HttpPost("verify-email")]
    public async Task<IActionResult> VerifyEmail(VerifyEmailDto request)
    {
        var result = await _accountService.VerifyEmailAsync(request);

        return result.IsSuccess ? NoContent() : this.ToErrorResult(result.Error);
    }

    [HttpPost("forgot-password")]
    [EnableRateLimiting(AuthRateLimiting.EmailPolicyName)]
    public async Task<ActionResult<AcceptedMessageDto>> ForgotPassword(AccountEmailRequestDto request)
    {
        return Accepted(await _accountService.ForgotPasswordAsync(request));
    }

    // Whether a reset link still works, before the user types a new password.
    // Uses nothing up.
    [HttpPost("reset-password/check")]
    public async Task<ActionResult<PasswordResetTokenStatusDto>> CheckPasswordReset(PasswordResetTokenDto request)
    {
        var result = await _accountService.CheckPasswordResetAsync(request);

        return result.IsSuccess ? Ok(result.Value) : this.ToErrorResult(result.Error);
    }

    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword(ResetPasswordDto request)
    {
        var result = await _accountService.ResetPasswordAsync(request);

        return result.IsSuccess ? NoContent() : this.ToErrorResult(result.Error);
    }
}
