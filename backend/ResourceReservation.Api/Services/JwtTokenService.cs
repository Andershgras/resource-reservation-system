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

    public IssuedToken CreateToken(User user)
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Email, user.Email),
            new(ClaimTypes.Name, user.Name),
            new(ClaimTypes.Role, user.Role),
            new(UserSessionValidator.SecurityStampClaimType,
                UserSessionValidator.FingerprintSecurityStamp(user.SecurityStamp))
        };

        var expiresAt = _timeProvider.GetUtcNow().AddMinutes(_jwtOptions.ExpiryMinutes);
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
            _jwtOptions.ExpiryMinutes * 60);
    }
}
