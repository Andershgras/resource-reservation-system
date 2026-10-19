# ADR 0013: Deleting Data That Is No Longer Needed

- **Status:** Accepted
- **Date:** 2026-10-19
- **Related:** [ADR 0011](0011-email-flows.md), [ADR 0012](0012-cookie-sessions-and-csrf.md)

## Context

Several tables only ever grew:

- **Booking emails** stayed in the `BookingNotifications` outbox after they were sent (ADR 0011).
- **Sessions** stayed in `UserSessions` after they expired or were revoked (ADR 0012).
- **Verification and reset links** stayed in `UserTokens` after they were used or expired.
- **Accounts that were never confirmed** stayed in `Users`. They can't sign in, and a later registration or reset of the address deals with them, but nothing removed them.

Each row holds an email address or a reference to one. Keeping personal data no longer needed for its purpose is what data protection rules, such as the GDPR's storage limitation, ask us to avoid.

Deleting accounts is the risky part. A wrong delete would remove data people rely on, or fail on a foreign key and stop the clean-up. The Milestone 7 PR 3 review asked for referential integrity to hold, and for no important related data to be deleted.

## Decision

A background worker in the API, `DataRetentionWorker`, runs `DataRetention` every hour, starting a minute after the API starts. Every period is a setting under `Retention`, validated at startup.

| Data | Deleted | Default |
|---|---|---|
| Sent booking emails | `SentAt` older than `SentBookingEmailDays` | 30 days |
| Given-up booking emails | `FailedAt` older than `FailedBookingEmailDays` | 90 days, longer, to investigate failures |
| Sessions | `ExpiresAt` older than `ExpiredSessionDays` | 7 days |
| Link tokens | used, or expired, more than `UsedLinkTokenDays` ago | 7 days |
| Unconfirmed accounts | registered more than `UnconfirmedAccountDays` ago | 7 days, at least 2 |

**Booking emails** can go without affecting calendars. Each reservation keeps its own calendar `SEQUENCE`, so later invitations still update the same event. An email that hasn't been sent or given up yet is never deleted.

**Sessions** are deleted after their expiry, whether or not they were revoked. A revoked session is useless as soon as it is revoked, but its row costs nothing until then.

### Unconfirmed accounts

An unconfirmed account is deleted only if all of these hold, checked by the delete statement itself:

- **It is still unconfirmed and active.** An account an admin deactivated is kept, because the admin acted on purpose. Deleting it would let the address be registered again.
- **It is a plain user, never an admin.**
- **It has a creation time** older than the cutoff.
- **Nothing important refers to it.** It owns no reservations, cancelled none, and created no closures. These are the foreign keys to `Users` that restrict deletes, so the database could never delete such an account anyway. The clean-up skips it rather than failing.
- **No link for it still works.** A user who asks for a new link is never deleted while it can be used, whatever the period.

What an account deletes along with it is throwaway: its spent link tokens, email cooldowns and sessions, through the database's existing `ON DELETE CASCADE`.

A test lists every foreign key to `Users` and its delete behaviour. A new table referring to users fails that test until someone decides how the clean-up treats it.

**Racing with the account's own activity.** Registering an address that has an account never changes that account. Resending a link inserts a token, which keeps the account. If the delete and that insert meet at the same instant, the foreign key makes the insert fail cleanly. The user asks again and registers afresh. No orphaned rows can result.

### How it deletes

- **In batches:** each rule is a single `DELETE` of at most `BatchSize` rows (1,000 by default), repeated until nothing matches. A large backlog never holds long locks.
- **Safe to run in parallel:** a row is deleted only if its rule still matches when the statement runs, so several API instances can clean up at the same time.
- **Fails safely:** a failed round is logged as an error, and the next round runs as usual.
- **Logs counts only,** never addresses or other personal data.
- **Off in tests:** the integration tests turn the worker off with `Retention:Enabled=false`, and run the clean-up directly against SQL Server.

We rejected a SQL Agent job or a separate container. Either would be one more thing to deploy, and SQL Server Express has no Agent.

## Consequences

- The tables stay small, and personal data no longer needed is removed within an hour of its period ending.
- An investigation into a sent email has 30 days, and into a failed one 90 days. Raise the settings if that's too short.
- Backups still hold deleted rows for as long as they are kept themselves.
- An address whose account was cleaned up can be registered again as new.
