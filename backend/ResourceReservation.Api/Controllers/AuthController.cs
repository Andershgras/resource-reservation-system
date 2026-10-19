using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;
using ResourceReservation.Api.Configuration;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.Models;
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
    private readonly IAntiforgery _antiforgery;
    private readonly AuthCookieOptions _cookieOptions;

    public AuthController(
        AuthService authService,
        AccountService accountService,
        IAntiforgery antiforgery,
        IOptions<AuthCookieOptions> cookieOptions)
    {
        _authService = authService;
        _accountService = accountService;
        _antiforgery = antiforgery;
        _cookieOptions = cookieOptions.Value;
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

    // Browser sign-in. The token goes into the httpOnly session cookie, never
    // into the response, so scripts on the page can't read it (ADR 0012). Like
    // every unsafe request, it needs an anti-forgery token, so another site
    // can't sign a visitor into the attacker's account.
    [HttpPost("login")]
    public async Task<ActionResult<SessionResponseDto>> Login(LoginUserDto loginUserDto)
    {
        var result = await _authService.LoginAsync(loginUserDto, UserSessionClients.Browser);

        if (!result.IsSuccess)
        {
            return this.ToErrorResult(result.Error);
        }

        // A browser that was already signed in replaces its session.
        if (HttpContext.Features.Get<CurrentUserSession>() is { } previous)
        {
            await _authService.RevokeSessionAsync(previous.SessionId);
        }

        var token = result.Value.Token;
        Response.Cookies.Append(
            _cookieOptions.SessionCookie,
            token.Token,
            _cookieOptions.CreateSessionCookieOptions(Request, token.ExpiresAt));

        return Ok(new SessionResponseDto
        {
            ExpiresAt = token.ExpiresAt,
            ExpiresInSeconds = token.ExpiresInSeconds,
            User = result.Value.User
        });
    }

    // Sign-in for clients other than browsers: the token is returned, to be
    // sent as "Authorization: Bearer <token>". No cookie is read or set, so it
    // needs no anti-forgery token. Same lockout and rate limit as /login.
    [HttpPost("token")]
    [NoAntiforgeryToken]
    public async Task<ActionResult<AuthResponseDto>> Token(LoginUserDto loginUserDto)
    {
        var result = await _authService.LoginAsync(loginUserDto, UserSessionClients.Token);

        if (!result.IsSuccess)
        {
            return this.ToErrorResult(result.Error);
        }

        var token = result.Value.Token;

        return Ok(new AuthResponseDto
        {
            Token = token.Token,
            ExpiresAt = token.ExpiresAt,
            ExpiresInSeconds = token.ExpiresInSeconds,
            User = result.Value.User
        });
    }

    // The signed-in user and the session's remaining lifetime. The frontend
    // calls this on page load to restore a session from its cookie.
    [HttpGet("me")]
    [Authorize]
    [DisableRateLimiting]
    public async Task<ActionResult<SessionResponseDto>> Me()
    {
        var current = HttpContext.Features.Get<CurrentUserSession>();
        var session = current is null ? null : await _authService.GetSessionAsync(current);

        return session is null ? Unauthorized() : Ok(session);
    }

    // Revokes the current session on the server, whether it came from the
    // cookie or a bearer header, and deletes the cookie. Other sessions of the
    // same user keep working. Succeeds without a valid session too, so a
    // browser can always clear its cookie.
    [HttpPost("logout")]
    [AllowAnonymous]
    [DisableRateLimiting]
    public async Task<IActionResult> Logout()
    {
        if (HttpContext.Features.Get<CurrentUserSession>() is { } current)
        {
            await _authService.RevokeSessionAsync(current.SessionId);
        }

        Response.Cookies.Delete(
            _cookieOptions.SessionCookie,
            _cookieOptions.CreateSessionCookieOptions(Request, expires: null));

        return NoContent();
    }

    // An anti-forgery request token for the current user, or for an anonymous
    // visitor before signing in. Also sets the anti-forgery cookie it is paired
    // with. The token changes with the user, so the frontend asks again after
    // signing in or out.
    [HttpGet("csrf")]
    [AllowAnonymous]
    [DisableRateLimiting]
    public ActionResult<CsrfTokenDto> Csrf()
    {
        var tokens = _antiforgery.GetAndStoreTokens(HttpContext);

        return Ok(new CsrfTokenDto { Token = tokens.RequestToken! });
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
