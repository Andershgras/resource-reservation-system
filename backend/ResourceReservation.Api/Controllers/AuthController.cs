using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using ResourceReservation.Api.Configuration;
using ResourceReservation.Api.Data;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.Models;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using System.Net.Mail;

namespace ResourceReservation.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly PasswordHasher<User> _passwordHasher = new();
    private readonly JwtOptions _jwtOptions;

    public AuthController(AppDbContext context, IOptions<JwtOptions> jwtOptions)
    {
        _context = context;
        _jwtOptions = jwtOptions.Value;
    }

    [HttpPost("register")]
    public async Task<ActionResult<UserResponseDto>> Register(RegisterUserDto registerUserDto)
    {
        if (string.IsNullOrWhiteSpace(registerUserDto.Name))
        {
            return BadRequest(ApiError("Name is required."));
        }

        if (!TryNormalizeEmail(registerUserDto.Email, out var normalizedEmail))
        {
            return BadRequest(ApiError("A valid email is required."));
        }

        if (string.IsNullOrWhiteSpace(registerUserDto.Password) || registerUserDto.Password.Length < 8)
        {
            return BadRequest(ApiError("Password must be at least 8 characters."));
        }

        if (await EmailExistsAsync(normalizedEmail))
        {
            return BadRequest(ApiError("Email is already registered."));
        }

        var user = new User
        {
            Name = registerUserDto.Name.Trim(),
            Email = normalizedEmail,
            Role = "User"
        };

        user.PasswordHash = _passwordHasher.HashPassword(user, registerUserDto.Password);

        _context.Users.Add(user);

        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            // A concurrent registration may have claimed the email first, in which
            // case the unique index rejected this insert.
            if (!await EmailExistsAsync(normalizedEmail))
            {
                throw;
            }

            return BadRequest(ApiError("Email is already registered."));
        }

        var userResponseDto = new UserResponseDto
        {
            Id = user.Id,
            Name = user.Name,
            Email = user.Email,
            Role = user.Role
        };

        return CreatedAtAction(nameof(Register), new { id = user.Id }, userResponseDto);
    }

    [HttpPost("login")]
    public async Task<ActionResult<AuthResponseDto>> Login(LoginUserDto loginUserDto)
    {
        if (!TryNormalizeEmail(loginUserDto.Email, out var normalizedEmail))
        {
            return Unauthorized(ApiError("Invalid email or password."));
        }

        var user = await _context.Users
            .FirstOrDefaultAsync(user => user.Email == normalizedEmail);

        if (user is null)
        {
            return Unauthorized(ApiError("Invalid email or password."));
        }

        var passwordResult = _passwordHasher.VerifyHashedPassword(
            user,
            user.PasswordHash,
            loginUserDto.Password);

        if (passwordResult == PasswordVerificationResult.Failed)
        {
            return Unauthorized(ApiError("Invalid email or password."));
        }

        var userResponseDto = new UserResponseDto
        {
            Id = user.Id,
            Name = user.Name,
            Email = user.Email,
            Role = user.Role
        };

        var authResponseDto = new AuthResponseDto
        {
            Token = CreateJwtToken(user),
            User = userResponseDto
        };

        return Ok(authResponseDto);
    }

    private string CreateJwtToken(User user)
    {
        var claims = new List<Claim>
    {
        new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
        new Claim(ClaimTypes.Email, user.Email),
        new Claim(ClaimTypes.Name, user.Name),
        new Claim(ClaimTypes.Role, user.Role)
    };

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwtOptions.Key));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: _jwtOptions.Issuer,
            audience: _jwtOptions.Audience,
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(_jwtOptions.ExpiryMinutes),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private Task<bool> EmailExistsAsync(string normalizedEmail)
    {
        return _context.Users
            .AsNoTracking()
            .AnyAsync(user => user.Email == normalizedEmail);
    }

    private static bool TryNormalizeEmail(string email, out string normalizedEmail)
    {
        normalizedEmail = string.Empty;

        if (string.IsNullOrWhiteSpace(email))
        {
            return false;
        }

        try
        {
            var mailAddress = new MailAddress(email.Trim());
            normalizedEmail = mailAddress.Address.ToLowerInvariant();
            return true;
        }
        catch (FormatException)
        {
            return false;
        }
    }

    private static ApiErrorResponseDto ApiError(string message)
    {
        return new ApiErrorResponseDto { Message = message };
    }
}
