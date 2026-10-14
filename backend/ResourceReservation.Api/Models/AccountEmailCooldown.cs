namespace ResourceReservation.Api.Models;

// When an account last got an email of one kind. Another of that kind isn't
// sent until the cooldown has passed, however many requests ask for one.
public class AccountEmailCooldown
{
    public int UserId { get; set; }

    public string Purpose { get; set; } = string.Empty;

    public DateTimeOffset LastSentAt { get; set; }
}

public static class AccountEmailPurposes
{
    public const string EmailVerification = UserTokenPurposes.EmailVerification;

    public const string PasswordReset = UserTokenPurposes.PasswordReset;

    // "Someone tried to register with your email."
    public const string ExistingAccountNotice = "ExistingAccountNotice";
}
