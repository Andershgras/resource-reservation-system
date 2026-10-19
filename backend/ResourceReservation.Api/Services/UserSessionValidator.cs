using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using ResourceReservation.Api.Data;

namespace ResourceReservation.Api.Services;

// The session a request was authenticated with, once UserSessionValidator has
// accepted its token. Kept in HttpContext.Features for the rest of the request.
public sealed record CurrentUserSession(int UserId, Guid SessionId, DateTimeOffset ExpiresAt);

// Checks on every authenticated request that the token still matches its user
// and its session: the account exists, is active and confirmed, the role is
// unchanged, the security stamp hasn't changed since the token was issued
// (ADR 0010, 0011), and the session exists, belongs to the user, hasn't
// expired and hasn't been revoked (ADR 0012).
//
// It fails closed: a token without a session ID, a session that can't be found
// and anything that doesn't match all mean "rejected". A database error isn't
// caught, so the request fails rather than being let through.
public class UserSessionValidator
{
    // The token carries a hash of the stamp, not the stamp itself, because
    // anyone holding a token can read its claims.
    public const string SecurityStampClaimType = "sst";

    // Not "sid", which the JWT handler would rename to ClaimTypes.Sid.
    public const string SessionIdClaimType = "sess";

    private readonly AppDbContext _context;
    private readonly TimeProvider _timeProvider;

    public UserSessionValidator(AppDbContext context, TimeProvider timeProvider)
    {
        _context = context;
        _timeProvider = timeProvider;
    }

    public static string FingerprintSecurityStamp(string securityStamp)
    {
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(securityStamp)));
    }

    // The accepted session, or null if the token must be rejected.
    public async Task<CurrentUserSession?> ValidateAsync(ClaimsPrincipal principal)
    {
        var fingerprint = principal.FindFirstValue(SecurityStampClaimType);

        // Tokens issued before stamps or sessions existed are rejected.
        if (!int.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId) ||
            string.IsNullOrEmpty(fingerprint) ||
            !Guid.TryParse(principal.FindFirstValue(SessionIdClaimType), out var sessionId))
        {
            return null;
        }

        var now = _timeProvider.GetUtcNow();
        var current = await _context.UserSessions
            .AsNoTracking()
            .Where(session =>
                session.Id == sessionId &&
                session.UserId == userId &&
                session.RevokedAt == null &&
                session.ExpiresAt > now)
            .Select(session => new
            {
                session.ExpiresAt,
                session.User!.IsActive,
                session.User.IsEmailConfirmed,
                session.User.Role,
                session.User.SecurityStamp
            })
            .SingleOrDefaultAsync();

        var isCurrent = current is { IsActive: true, IsEmailConfirmed: true } &&
            principal.IsInRole(current.Role) &&
            CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(FingerprintSecurityStamp(current.SecurityStamp)),
                Encoding.UTF8.GetBytes(fingerprint));

        return isCurrent ? new CurrentUserSession(userId, sessionId, current!.ExpiresAt) : null;
    }
}
