using System.Net.Mail;
using System.Runtime.CompilerServices;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using ResourceReservation.Api.Data;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.Models;

namespace ResourceReservation.Api.Services;

public class AuthService
{
    private const string InvalidCredentialsMessage = "Invalid email or password.";

    // A hash of a random password for each hasher, made by that hasher, so it has
    // the same algorithm and work factor as real password hashes. Created once.
    private static readonly ConditionalWeakTable<IPasswordHasher<User>, string> UnknownUserPasswordHashes = new();

    private readonly AppDbContext _context;
    private readonly JwtTokenService _jwtTokenService;
    private readonly IPasswordHasher<User> _passwordHasher;

    public AuthService(
        AppDbContext context,
        JwtTokenService jwtTokenService,
        IPasswordHasher<User> passwordHasher)
    {
        _context = context;
        _jwtTokenService = jwtTokenService;
        _passwordHasher = passwordHasher;
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
            // Verify the password anyway, so an unknown email takes about as long as
            // a wrong password. Otherwise the response time reveals which emails
            // have accounts.
            VerifyAgainstUnknownUserHash(request.Password);

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

        var issuedToken = _jwtTokenService.CreateToken(user);

        return new AuthResponseDto
        {
            Token = issuedToken.Token,
            ExpiresAt = issuedToken.ExpiresAt,
            ExpiresInSeconds = issuedToken.ExpiresInSeconds,
            User = ToUserResponseDto(user)
        };
    }

    private void VerifyAgainstUnknownUserHash(string password)
    {
        var unknownUserHash = UnknownUserPasswordHashes.GetValue(
            _passwordHasher,
            hasher => hasher.HashPassword(new User(), Guid.NewGuid().ToString()));

        // The result is ignored: no password can sign in as an unknown user.
        _passwordHasher.VerifyHashedPassword(new User(), unknownUserHash, password);
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
