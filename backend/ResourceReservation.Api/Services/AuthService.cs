using System.Net.Mail;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using ResourceReservation.Api.Data;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.Models;

namespace ResourceReservation.Api.Services;

public class AuthService
{
    private const string InvalidCredentialsMessage = "Invalid email or password.";

    private readonly AppDbContext _context;
    private readonly JwtTokenService _jwtTokenService;
    private readonly PasswordHasher<User> _passwordHasher = new();

    public AuthService(AppDbContext context, JwtTokenService jwtTokenService)
    {
        _context = context;
        _jwtTokenService = jwtTokenService;
    }

    public async Task<ServiceResult<UserResponseDto>> RegisterAsync(RegisterUserDto request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return ServiceError.Validation("Name is required.");
        }

        if (!TryNormalizeEmail(request.Email, out var normalizedEmail))
        {
            return ServiceError.Validation("A valid email is required.");
        }

        if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 8)
        {
            return ServiceError.Validation("Password must be at least 8 characters.");
        }

        if (await EmailExistsAsync(normalizedEmail))
        {
            return ServiceError.Validation("Email is already registered.");
        }

        var user = new User
        {
            Name = request.Name.Trim(),
            Email = normalizedEmail,
            Role = "User"
        };

        user.PasswordHash = _passwordHasher.HashPassword(user, request.Password);
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

            return ServiceError.Validation("Email is already registered.");
        }

        return ToUserResponseDto(user);
    }

    public async Task<ServiceResult<AuthResponseDto>> LoginAsync(LoginUserDto request)
    {
        if (!TryNormalizeEmail(request.Email, out var normalizedEmail))
        {
            return ServiceError.Unauthorized(InvalidCredentialsMessage);
        }

        var user = await _context.Users
            .FirstOrDefaultAsync(user => user.Email == normalizedEmail);

        if (user is null)
        {
            return ServiceError.Unauthorized(InvalidCredentialsMessage);
        }

        var passwordResult = _passwordHasher.VerifyHashedPassword(
            user,
            user.PasswordHash,
            request.Password);

        if (passwordResult == PasswordVerificationResult.Failed)
        {
            return ServiceError.Unauthorized(InvalidCredentialsMessage);
        }

        return new AuthResponseDto
        {
            Token = _jwtTokenService.CreateToken(user),
            User = ToUserResponseDto(user)
        };
    }

    private Task<bool> EmailExistsAsync(string normalizedEmail)
    {
        return _context.Users
            .AsNoTracking()
            .AnyAsync(user => user.Email == normalizedEmail);
    }

    private static UserResponseDto ToUserResponseDto(User user)
    {
        return new UserResponseDto
        {
            Id = user.Id,
            Name = user.Name,
            Email = user.Email,
            Role = user.Role
        };
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
}
