using System.Net;
using Microsoft.Extensions.Options;
using ResourceReservation.Api.Configuration;
using ResourceReservation.Api.Models;

namespace ResourceReservation.Api.Services;

// The text of account emails. Links put the token in the URL fragment, which
// browsers never send to a server, so it can't reach server logs, proxies or
// a Referer header. The page reads it, removes it from the address and posts it.
public class AccountEmails
{
    public const string VerificationKind = "email verification";
    public const string ExistingAccountKind = "existing account notice";
    public const string PasswordResetKind = "password reset";
    public const string PasswordChangedKind = "password changed notice";

    private readonly FrontendOptions _frontend;
    private readonly AccountTokenOptions _tokenOptions;

    public AccountEmails(IOptions<FrontendOptions> frontend, IOptions<AccountTokenOptions> tokenOptions)
    {
        _frontend = frontend.Value;
        _tokenOptions = tokenOptions.Value;
    }

    public AccountEmail Verification(User user, string token)
    {
        var link = _frontend.LinkTo("/verify-email", $"token={token}");

        return Create(VerificationKind, user, "Confirm your email address",
            $"Hello {user.Name},",
            [
                "Confirm your email address to finish creating your Resource Reservation account. " +
                    "You'll be asked for the password you chose.",
                $"The link works once, for {_tokenOptions.EmailVerificationHours} hours."
            ],
            ("Confirm your email", link),
            "Didn't create an account? Ignore this email. The account can't be used until someone " +
                "confirms it with the password it was created with.");
    }

    public AccountEmail ExistingAccount(User user)
    {
        return Create(ExistingAccountKind, user, "Someone tried to register with your email",
            $"Hello {user.Name},",
            [
                "Someone tried to create a Resource Reservation account with this email address, " +
                    "but it already has an account.",
                "If that was you, sign in, or reset your password if you've forgotten it."
            ],
            ("Reset your password", _frontend.LinkTo("/forgot-password")),
            "If it wasn't you, you don't need to do anything. Your account hasn't changed.");
    }

    // An unconfirmed account is set up again from scratch by the reset, so the
    // email says so (ADR 0011).
    public AccountEmail PasswordReset(User user, string token)
    {
        var link = _frontend.LinkTo("/reset-password", $"token={token}");
        string[] paragraphs = user.IsEmailConfirmed
            ? ["Someone asked to reset the password of your Resource Reservation account."]
            :
            [
                "Someone asked to reset the password of a Resource Reservation account with this email " +
                    "address. The account hasn't been confirmed yet.",
                "Following the link sets the account up again: you choose its name and password, " +
                    "and anything entered when it was created is replaced."
            ];

        return Create(PasswordResetKind, user, "Reset your password",
            $"Hello {user.Name},",
            [.. paragraphs, $"The link works once, for {_tokenOptions.PasswordResetMinutes} minutes."],
            ("Choose a new password", link),
            "Didn't ask for this? Ignore this email. Your password won't change.");
    }

    public AccountEmail PasswordChanged(User user)
    {
        return Create(PasswordChangedKind, user, "Your password was changed",
            $"Hello {user.Name},",
            [
                "The password of your Resource Reservation account was just changed, and every device " +
                    "that was signed in has been signed out."
            ],
            ("Sign in", _frontend.LinkTo("/login")),
            "If you didn't do this, reset your password straight away and tell an administrator.");
    }

    private static AccountEmail Create(
        string kind,
        User user,
        string subject,
        string greeting,
        string[] paragraphs,
        (string Label, string Url) action,
        string footer)
    {
        var text = string.Join("\n\n", [greeting, .. paragraphs, $"{action.Label}: {action.Url}", footer]);
        var html =
            $"<p>{Encode(greeting)}</p>" +
            string.Concat(paragraphs.Select(paragraph => $"<p>{Encode(paragraph)}</p>")) +
            $"<p><a href=\"{Encode(action.Url)}\">{Encode(action.Label)}</a></p>" +
            $"<p>{Encode(footer)}</p>";

        return new AccountEmail(kind, user.Id, new EmailMessage(user.Email, user.Name, subject, text, html, []));
    }

    private static string Encode(string value) => WebUtility.HtmlEncode(value);
}
