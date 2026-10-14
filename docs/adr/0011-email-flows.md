# ADR 0011: Email Verification, Password Reset And Booking Emails

- **Status:** Accepted
- **Date:** 2026-10-14
- **Related:** [ADR 0001](0001-time-zone-convention.md), [ADR 0002](0002-reservation-concurrency.md), [ADR 0010](0010-user-management-and-account-security.md), [security](../security.md)

## Context

Before this decision:
- Registration said "Email is already registered", so anyone could check whether an address had an account. A generic answer needed email verification ([security](../security.md#account-enumeration)).
- A user who forgot their password needed an admin.
- Nobody was told when a booking was made, moved or cancelled.

Milestone 6 PR 4 adds email. Agreed requirements:
- New accounts verify their address before signing in. Unverified accounts never get a token and can't book.
- Registration and forgot-password give the same answer whatever the address.
- Link tokens are random, expire (24 hours for verification, 1 hour for a reset), work once even against concurrent requests, and are stored only as hashes. They never appear in logs or stay in the browser's address.
- A reset ends every session, through the security stamp from ADR 0010.
- At most one email of each kind per account every 2 minutes, plus a per-IP rate limit.
- A safe policy for resetting an unverified account, which never hands an attacker's data to the address's owner.
- Booking emails for new, moved and cancelled bookings, with calendar invitations that update one event. They must survive an API restart, and a failed email must never undo a booking.
- A development email sender. A real provider is configured in Milestone 7. No external message broker.

## Decision

### Two delivery paths

| | Account emails (links, notices) | Booking emails |
|---|---|---|
| Queue | Bounded in-memory channel (1,000) | `BookingNotifications` table (outbox) |
| Written | After the request's work, never sent during it | In the same `SaveChanges` as the booking change |
| Sent by | `AccountEmailDispatcher` | `EmailOutboxWorker`, every 5 s |
| Retries | 3 attempts, 2 s then 10 s apart | 6 attempts, 30 s × 4ⁿ up to an hour |
| Survives a restart | No: the user asks again | Yes |
| On final failure | Error log with the kind and user ID | `FailedAt`, `LastError`, and an error log |

**Account emails stay in memory** because they carry raw link tokens, which must never be stored. Losing one on a restart is recoverable: the user asks for another.

**Booking emails use an outbox.** Each change adds a `BookingNotification` in the same `SaveChanges` as the booking, with a snapshot of the booking at that moment: kind, times, sequence, resource and recipient.
- The email exists exactly when the change does.
- Sending happens later, so a failed email can never undo a committed booking.
- Each attempt builds the email from the snapshot alone, so a retry is identical, with the same `Message-ID`.

**The outbox worker:**
- **Claiming:** it claims an entry with a conditional `UPDATE` that moves `NextAttemptAt` ahead by a 5-minute lease. With several API instances, only one sends each email.
- **Delivery is at least once, not exactly once.** An email can be sent twice: if the API stops, or the database can't be reached, after the email was handed to the sender but before `SentAt` was saved, the lease runs out and the email goes again. Exactly-once delivery isn't possible without the mail provider taking part in the transaction. A repeat is recognisable: it has the same `Message-ID`, and its invitation has the same UID and SEQUENCE, so calendars update the event they have rather than adding another. Recipients may still see the email twice in their inbox.
- **An email can also fail for good** after the last attempt. The booking stands, `FailedAt` and `LastError` record why, and an error is logged.
- **Deactivated users** get no booking emails.

### Development sender

`PickupDirectoryEmailSender` writes each email as an `.eml` file to `Email:PickupDirectory` instead of sending it, using `System.Net.Mail`'s pickup directory. The development folder, `.dev-emails`, is git-ignored, because it holds working links.

`Email:Delivery` has no default, so the API doesn't start outside Development until it is set. That way emails can't silently go nowhere. Milestone 7 adds a real delivery option.

### Tokens

- **Values:** 32 bytes from `RandomNumberGenerator`, written as 43 base64url characters.
- **Storage:** `UserTokens` stores the SHA-256 of the token, never the token itself. A fast hash is enough, because a 256-bit random value can't be guessed from its hash.
- **Single use:** a token is consumed by `UPDATE … SET UsedAt = now WHERE Id = @id AND UsedAt IS NULL AND ExpiresAt > now`. Of concurrent requests with one token, exactly one succeeds. The consumption shares a transaction with the token's effect, so a failure leaves the token unused.
- **Replacement:** issuing a token cancels earlier unused ones for the same purpose. A password reset cancels all of the user's tokens.
- **In links, the token sits in the URL fragment,** such as `/reset-password#token=…`:
  - Browsers never send the fragment to a server, so it can't reach server logs, proxies or a `Referer` header.
  - The page reads it and removes it from the address before drawing (`useLinkToken`).
  - The page only sends it in a `POST` when the form is submitted, so a mail scanner that opens the link can't use it up.

### Registration and verification

- **Registration** always returns `202` with "Check your inbox…" for valid input:
  - **A new address** gets an unconfirmed account and a verification link.
  - **An address that already has an account** gets a "someone tried to register with your email" notice. Its account is not changed, whether it is confirmed or not.
- **Unconfirmed accounts can't sign in:**
  - They get `403` "Confirm your email address…" only after the right password, the same pattern as deactivated accounts.
  - Token issuance also requires a confirmed account at that moment.
  - The per-request token check from ADR 0010 also requires a confirmed account. So even a correctly signed token for an unconfirmed account gets `401`, and it can never book.
- **Confirming needs the link and the account's password.**
  - Without the password: someone registers another person's address with their own password. The real owner gets the verification email and clicks it. That would activate an account whose password the attacker knows, under the owner's address.
  - With the password, only someone who controls the inbox and knows the account's password can confirm it.
  - A wrong password counts towards the lockout from ADR 0010, and leaves the link usable.
- **Existing accounts** are marked confirmed by the migration, with an empty `EmailConfirmedAt`, so they keep signing in.
- **Admins:** unconfirmed accounts can't be made admins, and don't count as active admins. Otherwise the last-admin rule could rely on an admin who can't sign in.

### Password reset

- **Asking:** `POST /api/auth/forgot-password` always returns `202` with the same message. It only sends a link to an active account.
- **Checking:** `POST /api/auth/reset-password/check` says whether a link still works, and whether it sets up an unconfirmed account. It uses nothing up.
- **Resetting:** `POST /api/auth/reset-password`, in one transaction:
  1. consumes the token;
  2. cancels the user's other tokens;
  3. sets the new password and a new security stamp, which ends every session (ADR 0010);
  4. clears the failure count and lockout.

  A "password changed" notice follows.

**Unconfirmed accounts.** Someone may have registered another person's address, choosing the name and password. A reset proves control of the inbox, so it sets the account up again for the owner:
- the owner's name (the page asks for it) and password;
- a new creation time;
- the email confirmed, all earlier links cancelled, and a new security stamp.

Nothing the registrant chose or caused survives: their name, password hash, creation time, security stamp, failed attempts and lockout, links and email cooldowns are all replaced or removed. Unconfirmed accounts can't sign in, book or be made admins, and no API books on another user's behalf, so they hold no other data. A test checks each of these after a registrant has set a password, failed a confirmation and asked for another link.

### Not revealing accounts

Three requests may send an email: register, resend-verification and forgot-password. For valid input, each of them:
- answers with the same status and message whatever the address;
- does similar work: registration hashes the password either way, and an unknown or ineligible address runs a cooldown `UPDATE` that matches nothing;
- **answers no sooner than `AccountTokens:MinimumResponseMilliseconds`** (250 ms). This floor was added after measuring: forgot-password took 8.3 ms for an existing account against 5.1 ms for an unknown address, because only an account gets a token. With the floor, the medians of all four cases (new and existing, for registration and forgot-password) were about 262 ms.

Invalid input is answered straight away, because it says nothing about accounts.

### Throttling

- **Per account:** at most one email of each kind every `AccountTokens:EmailCooldownSeconds` (120 s). The kinds are verification, reset and existing-account notice. `AccountEmailCooldowns` holds one row per account and kind, claimed with a conditional `UPDATE` or the first `INSERT`, so concurrent requests can't both send. Extra requests get the usual answer and send nothing.
- **Per IP:** register, resend-verification and forgot-password share a stricter rate limit (`RateLimiting:Email`, 5 per 15 minutes) of their own. Sign-in, verification and reset keep the existing 10 per minute.

### Calendar invitations

Each booking email carries `booking.ics`:
- **Method:** an iTIP `REQUEST` for a new or moved booking, and a `CANCEL` for a cancellation, with a matching `Content-Type` method parameter.
- **UID:** `reservation-{id}@{sender domain}` for every message about a booking.
- **SEQUENCE:** the reservation's `CalendarSequence`, which goes up with every move and the cancellation. So a calendar updates or removes the event it already has.
- **DTSTAMP:** when the change happened.
- **Times:** `DTSTART` and `DTEND` are converted from Copenhagen wall-clock time (ADR 0001) to UTC, so the file needs no time zone definitions.
  - A time in the hour skipped when summer time starts never happens, so it has no UTC instant. Such times are rejected when they are entered ([ADR 0001](0001-time-zone-convention.md#updates)), and converting one throws rather than moving it silently.
  - A time in the repeated autumn hour happens twice, and is read as its first occurrence, in summer time.
- **Format:** lines end in CRLF and are folded at 75 octets without splitting a character. Text is escaped.

## Consequences

- **Production needs `Email:Delivery`** and a public `Frontend:BaseUrl`. Until Milestone 7 adds a real provider, the only option writes files.
- **Restarts:** account emails still queued are lost, and users ask again. Booking emails are not lost, but may occasionally be sent twice (at least once, not exactly once).
- **The outbox keeps every sent row.** Nothing removes them yet. A clean-up job belongs with the deployment work.
- **The response floor** adds up to 250 ms to registration and the two email requests. Under heavy load the work can take longer than the floor, and small differences could show again.
- **API contract:** `POST /api/auth/register` now returns `202 { message }` instead of `201` with the user. Clients that read the user from it must change.
- **Everyone keeps signing in.** Existing accounts are confirmed by the migration. New accounts confirm first.
- **Registration tests moved** from in-memory unit tests to SQL Server, because the flows use `ExecuteUpdate` and transactions.
