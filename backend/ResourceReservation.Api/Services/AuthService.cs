using System.Net.Mail;
using System.Runtime.CompilerServices;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using ResourceReservation.Api.Configuration;
using ResourceReservation.Api.Data;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.Models;

namespace ResourceReservation.Api.Services;

public class AuthService
{
    // The only answer to a failed sign-in, whether the email is unknown, the
    // password is wrong or the account is locked, so none of them can be told
    // apart. It mentions the lockout because a locked-out user gets it too.
    public const string InvalidCredentialsMessage =
        "Invalid email or password. After repeated failed attempts, sign-in pauses for a few minutes.";

    // Only given after the correct password, so it reveals nothing new.
    public const string DeactivatedMessage = "This account has been deactivated. Contact an administrator.";

    // Also only after the correct password (ADR 0011).
    public const string EmailNotConfirmedMessage =
        "Confirm your email address before signing in. Use the link we sent you, or ask for a new one.";

    // A hash of a random password for each hasher, made by that hasher, so it has
    // the same algorithm and work factor as real password hashes. Created once.
    private static readonly ConditionalWeakTable<IPasswordHasher<User>, string> UnknownUserPasswordHashes = new();

    private readonly AppDbContext _context;
    private readonly JwtTokenService _jwtTokenService;
    private readonly IPasswordHasher<User> _passwordHasher;
    private readonly TimeProvider _timeProvider;
    private readonly AccountLockoutOptions _lockoutOptions;

    public AuthService(
        AppDbContext context,
        JwtTokenService jwtTokenService,
        IPasswordHasher<User> passwordHasher,
        TimeProvider timeProvider,
        IOptions<AccountLockoutOptions> lockoutOptions)
    {
        _context = context;
        _jwtTokenService = jwtTokenService;
        _passwordHasher = passwordHasher;
        _timeProvider = timeProvider;
        _lockoutOptions = lockoutOptions.Value;
    }

    // Every failed attempt, for a known or unknown email, verifies one password
    // hash and runs the same failure update, so failures take about as long as
    // each other and give the same answer (ADR 0010).
    public async Task<ServiceResult<AuthResponseDto>> LoginAsync(LoginUserDto request)
    {
        if (!TryNormalizeEmail(request.Email, out var normalizedEmail))
        {
            return ServiceError.Unauthorized(InvalidCredentialsMessage);
        }

        var now = _timeProvider.GetUtcNow();
        var user = await _context.Users
            .AsNoTracking()
            .FirstOrDefaultAsync(user => user.Email == normalizedEmail);

        if (user is null)
        {
            VerifyAgainstUnknownUserHash(request.Password);
            await RecordFailedLoginAsync(normalizedEmail, now);

            return ServiceError.Unauthorized(InvalidCredentialsMessage);
        }

        var passwordResult = _passwordHasher.VerifyHashedPassword(
            user,
            user.PasswordHash,
            request.Password);

        if (passwordResult == PasswordVerificationResult.Failed)
        {
            await RecordFailedLoginAsync(normalizedEmail, now);

            return ServiceError.Unauthorized(InvalidCredentialsMessage);
        }

        // Even the correct password doesn't get in during a lockout.
        if (IsLockedOut(user.LockoutEndsAt, now))
        {
            return ServiceError.Unauthorized(InvalidCredentialsMessage);
        }

        if (!user.IsActive)
        {
            return ServiceError.Forbidden(DeactivatedMessage);
        }

        if (!user.IsEmailConfirmed)
        {
            return ServiceError.Forbidden(EmailNotConfirmedMessage);
        }

        // Reset the failure count only if, at this moment, the account is still
        // unlocked, active, confirmed and unchanged. A lockout, deactivation or role change
        // that happened since the user was read makes this match nothing, so no
        // token is issued from out-of-date data.
        var stillAllowed = await _context.Users
            .Where(candidate =>
                candidate.Id == user.Id &&
                candidate.IsActive &&
                candidate.IsEmailConfirmed &&
                candidate.SecurityStamp == user.SecurityStamp &&
                (candidate.LockoutEndsAt == null || candidate.LockoutEndsAt <= now))
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(candidate => candidate.FailedLoginCount, 0)
                .SetProperty(candidate => candidate.LockoutEndsAt, (DateTimeOffset?)null));

        if (stillAllowed == 0)
        {
            return ServiceError.Unauthorized(InvalidCredentialsMessage);
        }

        if (passwordResult == PasswordVerificationResult.SuccessRehashNeeded)
        {
            await RehashPasswordAsync(user, request.Password);
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

    public static bool IsLockedOut(DateTimeOffset? lockoutEndsAt, DateTimeOffset now)
    {
        return lockoutEndsAt is not null && lockoutEndsAt > now;
    }

    // One UPDATE statement, so concurrent failures each count exactly once.
    // Reaching the limit locks the account and starts the count again. A locked
    // account matches nothing, so attempts during a lockout don't extend it.
    // An unknown email matches nothing too, but costs the same round trip.
    public Task<int> RecordFailedLoginAsync(string normalizedEmail, DateTimeOffset now)
    {
        var maxFailedAttempts = _lockoutOptions.MaxFailedAttempts;
        DateTimeOffset? lockoutEndsAt = now.AddMinutes(_lockoutOptions.LockoutMinutes);

        return _context.Users
            .Where(user =>
                user.Email == normalizedEmail &&
                (user.LockoutEndsAt == null || user.LockoutEndsAt <= now))
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(
                    user => user.LockoutEndsAt,
                    user => user.FailedLoginCount + 1 >= maxFailedAttempts ? lockoutEndsAt : null)
                .SetProperty(
                    user => user.FailedLoginCount,
                    user => user.FailedLoginCount + 1 >= maxFailedAttempts ? 0 : user.FailedLoginCount + 1));
    }

    // Replaces the hash only if it is still the one that was verified, so a
    // password changed meanwhile is never overwritten with the old password.
    private Task<int> RehashPasswordAsync(User user, string password)
    {
        var verifiedHash = user.PasswordHash;
        var newHash = _passwordHasher.HashPassword(user, password);

        return _context.Users
            .Where(candidate => candidate.Id == user.Id && candidate.PasswordHash == verifiedHash)
            .ExecuteUpdateAsync(setters => setters.SetProperty(candidate => candidate.PasswordHash, newHash));
    }

    private void VerifyAgainstUnknownUserHash(string password)
    {
        var unknownUserHash = UnknownUserPasswordHashes.GetValue(
            _passwordHasher,
            hasher => hasher.HashPassword(new User(), Guid.NewGuid().ToString()));

        // The result is ignored: no password can sign in as an unknown user.
        _passwordHasher.VerifyHashedPassword(new User(), unknownUserHash, password);
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

    public static bool TryNormalizeEmail(string? email, out string normalizedEmail)
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
