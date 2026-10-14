namespace ResourceReservation.Api.DTOs;

// A user account as admins see it. Never includes the password hash, the
// security stamp or the lockout state.
public class UserAccountResponseDto
{
    public int Id { get; set; }

    public string Name { get; set; } = string.Empty;

    public string Email { get; set; } = string.Empty;

    public string Role { get; set; } = string.Empty;

    public bool IsActive { get; set; }

    // False until the owner confirms the address. Such accounts can't sign in.
    public bool IsEmailConfirmed { get; set; }

    // Null for accounts created before it was recorded.
    public DateTimeOffset? CreatedAt { get; set; }
}
