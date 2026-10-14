using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using ResourceReservation.Api.Configuration;
using ResourceReservation.Api.Data;
using ResourceReservation.Api.Models;

namespace ResourceReservation.Api.Services;

// Single-use link tokens and the per-account email cooldown (ADR 0011).
public class UserTokenService
{
    // 32 random bytes as base64url: 43 characters, 256 bits.
    public const int TokenLength = 43;

    private readonly AppDbContext _context;
    private readonly TimeProvider _timeProvider;
    private readonly AccountTokenOptions _options;

    public UserTokenService(AppDbContext context, TimeProvider timeProvider, IOptions<AccountTokenOptions> options)
    {
        _context = context;
        _timeProvider = timeProvider;
        _options = options.Value;
    }

    // A fast hash is enough: unlike a password, the token is 256 random bits,
    // so it can't be guessed from its hash.
    public static string HashToken(string token)
    {
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
    }

    // A new token for the user. Earlier unused tokens with the same purpose stop
    // working, so only the newest link does. Returns the token, which is never
    // stored.
    public async Task<string> IssueAsync(int userId, string purpose)
    {
        var token = Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
        var now = _timeProvider.GetUtcNow();

        await _context.UserTokens
            .Where(existing => existing.UserId == userId && existing.Purpose == purpose && existing.UsedAt == null)
            .ExecuteUpdateAsync(setters => setters.SetProperty(existing => existing.UsedAt, now));

        _context.UserTokens.Add(new UserToken
        {
            UserId = userId,
            Purpose = purpose,
            TokenHash = HashToken(token),
            CreatedAt = now,
            ExpiresAt = now + GetLifetime(purpose)
        });
        await _context.SaveChangesAsync();

        return token;
    }

    // The token's record if it can still be used, otherwise null. Uses nothing up.
    public async Task<UserToken?> FindUsableAsync(string? token, string purpose)
    {
        if (token is null || token.Length != TokenLength)
        {
            return null;
        }

        var hash = HashToken(token);
        var now = _timeProvider.GetUtcNow();

        return await _context.UserTokens
            .AsNoTracking()
            .FirstOrDefaultAsync(candidate =>
                candidate.TokenHash == hash &&
                candidate.Purpose == purpose &&
                candidate.UsedAt == null &&
                candidate.ExpiresAt > now);
    }

    // Uses the token up with one conditional UPDATE, so of two requests with the
    // same token, only one can succeed. Call inside the transaction that applies
    // the token's effect, so a failure afterwards leaves it unused.
    public async Task<bool> TryConsumeAsync(int tokenId)
    {
        var now = _timeProvider.GetUtcNow();

        return await _context.UserTokens
            .Where(token => token.Id == tokenId && token.UsedAt == null && token.ExpiresAt > now)
            .ExecuteUpdateAsync(setters => setters.SetProperty(token => token.UsedAt, now)) == 1;
    }

    // Every unused token of the user stops working, whatever its purpose.
    public Task RevokeAllAsync(int userId)
    {
        var now = _timeProvider.GetUtcNow();

        return _context.UserTokens
            .Where(token => token.UserId == userId && token.UsedAt == null)
            .ExecuteUpdateAsync(setters => setters.SetProperty(token => token.UsedAt, now));
    }

    // True if this account may be sent an email of this kind now, and records
    // that it is. Concurrent requests can't both get true within one cooldown:
    // either one UPDATE moves the time forward, or one INSERT wins the key.
    public async Task<bool> TryStartEmailCooldownAsync(int userId, string purpose)
    {
        var now = _timeProvider.GetUtcNow();
        var cooledDownBefore = now.AddSeconds(-_options.EmailCooldownSeconds);

        var updated = await _context.AccountEmailCooldowns
            .Where(cooldown =>
                cooldown.UserId == userId &&
                cooldown.Purpose == purpose &&
                cooldown.LastSentAt <= cooledDownBefore)
            .ExecuteUpdateAsync(setters => setters.SetProperty(cooldown => cooldown.LastSentAt, now));

        if (updated == 1)
        {
            return true;
        }

        if (await _context.AccountEmailCooldowns.AnyAsync(cooldown =>
                cooldown.UserId == userId && cooldown.Purpose == purpose))
        {
            return false;
        }

        var cooldown = new AccountEmailCooldown { UserId = userId, Purpose = purpose, LastSentAt = now };
        _context.AccountEmailCooldowns.Add(cooldown);

        try
        {
            await _context.SaveChangesAsync();

            return true;
        }
        catch (DbUpdateException)
        {
            // Another request inserted it first.
            _context.Entry(cooldown).State = EntityState.Detached;

            return false;
        }
    }

    // The same kind of statement for an email with no account, which matches
    // nothing, so the request costs about the same either way.
    public Task TouchNoCooldownAsync()
    {
        var now = _timeProvider.GetUtcNow();

        return _context.AccountEmailCooldowns
            .Where(cooldown => cooldown.UserId == 0)
            .ExecuteUpdateAsync(setters => setters.SetProperty(cooldown => cooldown.LastSentAt, now));
    }

    private TimeSpan GetLifetime(string purpose)
    {
        return purpose switch
        {
            UserTokenPurposes.EmailVerification => TimeSpan.FromHours(_options.EmailVerificationHours),
            UserTokenPurposes.PasswordReset => TimeSpan.FromMinutes(_options.PasswordResetMinutes),
            _ => throw new ArgumentOutOfRangeException(nameof(purpose), purpose, null)
        };
    }

    private static string Base64UrlEncode(byte[] bytes)
    {
        return Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }
}
