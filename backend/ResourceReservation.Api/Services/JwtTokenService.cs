using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using ResourceReservation.Api.Configuration;
using ResourceReservation.Api.Models;

namespace ResourceReservation.Api.Services;

// A signed token and when it stops being accepted.
public record IssuedToken(string Token, DateTimeOffset ExpiresAt, int ExpiresInSeconds);

public class JwtTokenService
{
    private readonly JwtOptions _jwtOptions;
    private readonly TimeProvider _timeProvider;

    public JwtTokenService(IOptions<JwtOptions> jwtOptions, TimeProvider timeProvider)
    {
        _jwtOptions = jwtOptions.Value;
        _timeProvider = timeProvider;
    }

    // The token belongs to one session, whose ID it carries. The session must
    // already exist with the same expiry (see AuthService.LoginAsync).
    public IssuedToken CreateToken(User user, Guid sessionId, DateTimeOffset expiresAt)
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Email, user.Email),
            new(ClaimTypes.Name, user.Name),
            new(ClaimTypes.Role, user.Role),
            new(UserSessionValidator.SecurityStampClaimType,
                UserSessionValidator.FingerprintSecurityStamp(user.SecurityStamp)),
            new(UserSessionValidator.SessionIdClaimType, sessionId.ToString())
        };

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwtOptions.Key));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: _jwtOptions.Issuer,
            audience: _jwtOptions.Audience,
            claims: claims,
            expires: expiresAt.UtcDateTime,
            signingCredentials: credentials);

        return new IssuedToken(
            new JwtSecurityTokenHandler().WriteToken(token),
            expiresAt,
            (int)Math.Ceiling((expiresAt - _timeProvider.GetUtcNow()).TotalSeconds));
    }

    // When a token issued now stops being accepted.
    public DateTimeOffset GetExpiry()
    {
        return _timeProvider.GetUtcNow().AddMinutes(_jwtOptions.ExpiryMinutes);
    }
}
