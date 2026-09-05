using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ResourceReservation.Api.Data;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.Models;

namespace ResourceReservation.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly PasswordHasher<User> _passwordHasher = new();

    public AuthController(AppDbContext context)
    {
        _context = context;
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
}