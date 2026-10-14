using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using ResourceReservation.Api.Data;
using ResourceReservation.Api.Models;

namespace ResourceReservation.Api.Services;

// Checks on every authenticated request that the token still matches its user:
// the account exists, is active and confirmed, the role is unchanged, and the
// security stamp hasn't changed since the token was issued (ADR 0010, 0011).
public class UserSessionValidator
{
    // The token carries a hash of the stamp, not the stamp itself, because
    // anyone holding a token can read its claims.
    public const string SecurityStampClaimType = "sst";

    private readonly AppDbContext _context;

    public UserSessionValidator(AppDbContext context)
    {
        _context = context;
    }

    public static string FingerprintSecurityStamp(string securityStamp)
    {
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(securityStamp)));
    }

    public async Task<bool> IsCurrentAsync(ClaimsPrincipal principal)
    {
        var fingerprint = principal.FindFirstValue(SecurityStampClaimType);

        // Tokens issued before stamps existed have no fingerprint and are rejected.
        if (!int.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId) ||
            string.IsNullOrEmpty(fingerprint))
        {
            return false;
        }

        var user = await _context.Users
            .AsNoTracking()
            .Where(user => user.Id == userId)
            .Select(user => new { user.IsActive, user.IsEmailConfirmed, user.Role, user.SecurityStamp })
            .SingleOrDefaultAsync();

        return user is { IsActive: true, IsEmailConfirmed: true } &&
            principal.IsInRole(user.Role) &&
            CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(FingerprintSecurityStamp(user.SecurityStamp)),
                Encoding.UTF8.GetBytes(fingerprint));
    }
}
