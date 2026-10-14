using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using ResourceReservation.Api.Configuration;
using ResourceReservation.Api.Data;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.Models;

namespace ResourceReservation.Api.Services;

// Registration, email verification and password reset (ADR 0011).
//
// Requests that may send an email always give the same answer, do about the
// same work and answer no sooner than a minimum time, so they never reveal
// whether an address has an account. Emails are queued, never sent during the
// request.
public class AccountService
{
    public const string RegistrationAcceptedMessage =
        "Check your inbox to finish creating your account. If the email doesn't arrive, you can ask for a new one.";

    public const string VerificationRequestedMessage =
        "If that address has an account waiting to be confirmed, we've sent it a new link.";

    public const string PasswordResetRequestedMessage =
        "If that address has an account, we've sent it a link to reset the password.";

    public const string InvalidLinkMessage =
        "This link doesn't work. It may have expired or been used already. Ask for a new one.";

    public const string WrongPasswordMessage =
        "That isn't the password this account was created with.";

    public const string TooManyAttemptsMessage =
        "Too many failed attempts. Try again in a few minutes.";

    public const string NameRequiredMessage = "Enter your name.";

    private readonly AppDbContext _context;
    private readonly AuthService _authService;
    private readonly UserTokenService _tokens;
    private readonly AccountEmails _emails;
    private readonly AccountEmailQueue _emailQueue;
    private readonly IPasswordHasher<User> _passwordHasher;
    private readonly TimeProvider _timeProvider;
    private readonly AccountTokenOptions _tokenOptions;

    public AccountService(
        AppDbContext context,
        AuthService authService,
        UserTokenService tokens,
        AccountEmails emails,
        AccountEmailQueue emailQueue,
        IPasswordHasher<User> passwordHasher,
        TimeProvider timeProvider,
        IOptions<AccountTokenOptions> tokenOptions)
    {
        _context = context;
        _authService = authService;
        _tokens = tokens;
        _emails = emails;
        _emailQueue = emailQueue;
        _passwordHasher = passwordHasher;
        _timeProvider = timeProvider;
        _tokenOptions = tokenOptions.Value;
    }

    // A new address gets an unconfirmed account and a verification link. An
    // address that already has an account gets a notice instead, and the
    // account isn't changed. Both answer the same and hash the password.
    // Answers about invalid input at once: that reveals nothing about accounts.
    public async Task<ServiceResult<AcceptedMessageDto>> RegisterAsync(RegisterUserDto request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return ServiceError.Validation("Name is required.");
        }

        if (!AuthService.TryNormalizeEmail(request.Email, out var normalizedEmail))
        {
            return ServiceError.Validation("A valid email is required.");
        }

        if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 8)
        {
            return ServiceError.Validation("Password must be at least 8 characters.");
        }

        var startedAt = _timeProvider.GetTimestamp();
        await RegisterValidRequestAsync(request, normalizedEmail);
        await WaitForMinimumResponseTimeAsync(startedAt);

        return Accepted(RegistrationAcceptedMessage);
    }

    private async Task RegisterValidRequestAsync(RegisterUserDto request, string normalizedEmail)
    {
        var existing = await FindByEmailAsync(normalizedEmail);

        if (existing is null)
        {
            var user = new User
            {
                Name = request.Name.Trim(),
                Email = normalizedEmail,
                Role = UserRoles.User,
                IsEmailConfirmed = false,
                CreatedAt = _timeProvider.GetUtcNow()
            };
            user.PasswordHash = _passwordHasher.HashPassword(user, request.Password);
            _context.Users.Add(user);

            try
            {
                await _context.SaveChangesAsync();
            }
            catch (DbUpdateException)
            {
                // A concurrent registration claimed the address first. Answer as
                // for any existing account.
                _context.Entry(user).State = EntityState.Detached;
                existing = await FindByEmailAsync(normalizedEmail) ?? throw new InvalidOperationException(
                    "A registration failed, but no account has the address.");
            }

            if (existing is null)
            {
                await _tokens.TryStartEmailCooldownAsync(user.Id, AccountEmailPurposes.EmailVerification);
                var token = await _tokens.IssueAsync(user.Id, UserTokenPurposes.EmailVerification);
                _emailQueue.Enqueue(_emails.Verification(user, token));

                return;
            }
        }
        else
        {
            // As costly as hashing a new account's password. The result is unused.
            _passwordHasher.HashPassword(existing, request.Password);
        }

        if (await _tokens.TryStartEmailCooldownAsync(existing.Id, AccountEmailPurposes.ExistingAccountNotice))
        {
            _emailQueue.Enqueue(_emails.ExistingAccount(existing));
        }
    }

    public async Task<AcceptedMessageDto> ResendVerificationAsync(AccountEmailRequestDto request)
    {
        var startedAt = _timeProvider.GetTimestamp();
        var user = await FindByEmailAsync(request.Email);

        if (user is not { IsActive: true, IsEmailConfirmed: false })
        {
            await _tokens.TouchNoCooldownAsync();
        }
        else if (await _tokens.TryStartEmailCooldownAsync(user.Id, AccountEmailPurposes.EmailVerification))
        {
            var token = await _tokens.IssueAsync(user.Id, UserTokenPurposes.EmailVerification);
            _emailQueue.Enqueue(_emails.Verification(user, token));
        }

        await WaitForMinimumResponseTimeAsync(startedAt);

        return Accepted(VerificationRequestedMessage);
    }

    // The token proves the inbox and the password proves who registered, so a
    // link sent to someone who didn't register can't activate the account.
    // A wrong password counts towards the account's lockout, and leaves the
    // link usable.
    public async Task<ServiceResult> VerifyEmailAsync(VerifyEmailDto request)
    {
        var token = await _tokens.FindUsableAsync(request.Token, UserTokenPurposes.EmailVerification);
        var user = token is null ? null : await _context.Users.AsNoTracking().FirstOrDefaultAsync(user => user.Id == token.UserId);

        if (token is null || user is not { IsActive: true })
        {
            return ServiceError.Validation(InvalidLinkMessage);
        }

        var now = _timeProvider.GetUtcNow();

        if (AuthService.IsLockedOut(user.LockoutEndsAt, now))
        {
            return ServiceError.Validation(TooManyAttemptsMessage);
        }

        if (_passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.Password) ==
            PasswordVerificationResult.Failed)
        {
            await _authService.RecordFailedLoginAsync(user.Email, now);

            return ServiceError.Validation(WrongPasswordMessage);
        }

        await using var transaction = await _context.Database.BeginTransactionAsync();

        if (!await _tokens.TryConsumeAsync(token.Id))
        {
            return ServiceError.Validation(InvalidLinkMessage);
        }

        await _context.Users
            .Where(candidate => candidate.Id == user.Id && !candidate.IsEmailConfirmed)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(candidate => candidate.IsEmailConfirmed, true)
                .SetProperty(candidate => candidate.EmailConfirmedAt, now));
        await transaction.CommitAsync();

        return ServiceResult.Success;
    }

    // Any active account, confirmed or not, can be sent a reset link.
    public async Task<AcceptedMessageDto> ForgotPasswordAsync(AccountEmailRequestDto request)
    {
        var startedAt = _timeProvider.GetTimestamp();
        var user = await FindByEmailAsync(request.Email);

        if (user is not { IsActive: true })
        {
            await _tokens.TouchNoCooldownAsync();
        }
        else if (await _tokens.TryStartEmailCooldownAsync(user.Id, AccountEmailPurposes.PasswordReset))
        {
            var token = await _tokens.IssueAsync(user.Id, UserTokenPurposes.PasswordReset);
            _emailQueue.Enqueue(_emails.PasswordReset(user, token));
        }

        await WaitForMinimumResponseTimeAsync(startedAt);

        return Accepted(PasswordResetRequestedMessage);
    }

    public async Task<ServiceResult<PasswordResetTokenStatusDto>> CheckPasswordResetAsync(PasswordResetTokenDto request)
    {
        var token = await _tokens.FindUsableAsync(request.Token, UserTokenPurposes.PasswordReset);
        var user = token is null ? null : await _context.Users.AsNoTracking().FirstOrDefaultAsync(user => user.Id == token.UserId);

        if (user is not { IsActive: true })
        {
            return ServiceError.Validation(InvalidLinkMessage);
        }

        return new PasswordResetTokenStatusDto { CompletesRegistration = !user.IsEmailConfirmed };
    }

    // Sets the new password, ends every session through a new security stamp,
    // clears any lockout and cancels the user's other links.
    //
    // An unconfirmed account may have been registered by someone else with this
    // address. Resetting it proves the inbox, so the reset sets the account up
    // again for the inbox owner: their name and password, a new creation time,
    // and nothing kept from the registration. Unconfirmed accounts can't sign
    // in or book, so they hold nothing else.
    public async Task<ServiceResult> ResetPasswordAsync(ResetPasswordDto request)
    {
        var token = await _tokens.FindUsableAsync(request.Token, UserTokenPurposes.PasswordReset);
        var user = token is null ? null : await _context.Users.FirstOrDefaultAsync(user => user.Id == token.UserId);

        if (token is null || user is not { IsActive: true })
        {
            return ServiceError.Validation(InvalidLinkMessage);
        }

        var completesRegistration = !user.IsEmailConfirmed;

        if (completesRegistration && string.IsNullOrWhiteSpace(request.Name))
        {
            return ServiceError.Validation(NameRequiredMessage);
        }

        var now = _timeProvider.GetUtcNow();
        await using var transaction = await _context.Database.BeginTransactionAsync();

        if (!await _tokens.TryConsumeAsync(token.Id))
        {
            return ServiceError.Validation(InvalidLinkMessage);
        }

        await _tokens.RevokeAllAsync(user.Id);

        if (completesRegistration)
        {
            user.Name = request.Name!.Trim();
            user.CreatedAt = now;
            user.IsEmailConfirmed = true;
            user.EmailConfirmedAt = now;
        }

        user.PasswordHash = _passwordHasher.HashPassword(user, request.Password);
        user.SecurityStamp = User.NewSecurityStamp();
        user.FailedLoginCount = 0;
        user.LockoutEndsAt = null;
        await _context.SaveChangesAsync();
        await transaction.CommitAsync();

        _emailQueue.Enqueue(_emails.PasswordChanged(user));

        return ServiceResult.Success;
    }

    private async Task<User?> FindByEmailAsync(string? email)
    {
        if (!AuthService.TryNormalizeEmail(email, out var normalizedEmail))
        {
            return null;
        }

        return await _context.Users.AsNoTracking().FirstOrDefaultAsync(user => user.Email == normalizedEmail);
    }

    private async Task WaitForMinimumResponseTimeAsync(long startedAt)
    {
        var remaining = TimeSpan.FromMilliseconds(_tokenOptions.MinimumResponseMilliseconds) -
            _timeProvider.GetElapsedTime(startedAt);

        if (remaining > TimeSpan.Zero)
        {
            await Task.Delay(remaining, _timeProvider);
        }
    }

    private static AcceptedMessageDto Accepted(string message) => new() { Message = message };
}
