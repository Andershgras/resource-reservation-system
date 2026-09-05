using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ResourceReservation.Api.Data;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.Models;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace ResourceReservation.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly PasswordHasher<User> _passwordHasher = new();
    private readonly IConfiguration _configuration;
    public AuthController(AppDbContext context, IConfiguration configuration)
    {
        _context = context;
        _configuration = configuration;
    }

    [HttpPost("register")]
    public async Task<ActionResult<UserResponseDto>> Register(RegisterUserDto registerUserDto)
    {
        var emailExists = await _context.Users
            .AnyAsync(user => user.Email == registerUserDto.Email);

        if (emailExists)
        {
            return BadRequest("Email is already registered.");
        }

        var user = new User
        {
            Name = registerUserDto.Name,
            Email = registerUserDto.Email,
            Role = "User"
        };

        user.PasswordHash = _passwordHasher.HashPassword(user, registerUserDto.Password);

        _context.Users.Add(user);
        await _context.SaveChangesAsync();

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
        var user = await _context.Users
            .FirstOrDefaultAsync(user => user.Email == loginUserDto.Email);

        if (user is null)
        {
            return Unauthorized("Invalid email or password.");
        }

        var passwordResult = _passwordHasher.VerifyHashedPassword(
            user,
            user.PasswordHash,
            loginUserDto.Password);

        if (passwordResult == PasswordVerificationResult.Failed)
        {
            return Unauthorized("Invalid email or password.");
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
        var jwtKey = _configuration["Jwt:Key"];

        if (string.IsNullOrWhiteSpace(jwtKey))
        {
            throw new InvalidOperationException("JWT key is not configured.");
        }

        var claims = new List<Claim>
    {
        new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
        new Claim(ClaimTypes.Email, user.Email),
        new Claim(ClaimTypes.Name, user.Name),
        new Claim(ClaimTypes.Role, user.Role)
    };

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: _configuration["Jwt:Issuer"],
            audience: _configuration["Jwt:Audience"],
            claims: claims,
            expires: DateTime.UtcNow.AddHours(2),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}