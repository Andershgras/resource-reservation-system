# ADR 0010: User Management And Account Security

- **Status:** Accepted
- **Date:** 2026-10-14
- **Related:** [ADR 0002](0002-reservation-concurrency.md), [ADR 0004](0004-token-storage-and-session-expiry.md), audit M4 and L9, [security](../security.md)

## Context

Before this decision:
- Roles could only be set in the database, and an account couldn't be switched off.
- A token stayed valid for its whole lifetime, whatever happened to its user, because the API trusted the token's claims alone.
- Only a per-IP rate limit slowed password guessing. An attacker with many IP addresses could keep guessing one account's password.
- Old-format password hashes were accepted but never replaced (from Milestone 3).

Milestone 6 PR 3 adds admin user management and account security. Agreed requirements:
- Admins list users, change roles and deactivate accounts. Deactivated users keep their reservations.
- There is always at least one active admin, even with concurrent requests. Admins can't demote or deactivate themselves.
- Role changes and deactivation affect existing tokens immediately, including a demoted admin's.
- Five failed sign-ins lock an account for 15 minutes, without revealing whether an account exists.
- Concurrent sign-ins can't get around a lockout or corrupt the failure count.
- Deactivated accounts never get a token, and deactivation is only revealed after the right password.
- Re-hashing can't overwrite a newer password.

## Decision

### Data

`Users` gains five columns. Existing data is kept:

| Column | Existing rows | Purpose |
|---|---|---|
| `IsActive` | `true` | Deactivated users can't sign in, and their tokens stop working |
| `SecurityStamp` | A new random value for each row | Changes whenever existing tokens must stop working |
| `CreatedAt` | `NULL` (unknown, not invented) | Shown to admins |
| `FailedLoginCount` | `0` | Failures since the last success or lockout |
| `LockoutEndsAt` | `NULL` | When a lockout ends |

- **The stamp** is 32 bytes from a cryptographic random number generator, stored as 64 hex characters. The app makes it with `RandomNumberGenerator`. The migration fills existing rows with SQL Server's `CRYPT_GEN_RANDOM`, row by row, and the column keeps that as its default.
- **`IsActive` has no default in the model.** With a `true` default, EF would never send `false` on insert, and an inactive user would be saved as active. The migration's default only fills existing rows.

### Tokens are checked against the database on every request

- Tokens carry a SHA-256 fingerprint of the stamp, in the `sst` claim. Anyone holding a token can read its claims, so the token never carries the stamp itself. The API never returns the stamp, and tests check the JSON of the login and user list responses.
- After the signature and lifetime checks, `UserSessionValidator` loads the user's active flag, role and stamp by primary key. The token is rejected unless the user is active, the role matches the token's, and the fingerprints match in constant time.
- Changing a role or deactivating an account sets a new stamp. The user's next request gets a 401, and the frontend's existing handling signs them out ([ADR 0004](0004-token-storage-and-session-expiry.md)). A user whose role changed signs in again with the new role.
- Tokens issued before this change have no fingerprint, so everyone signs in once more.
- The cost is one indexed lookup per authenticated request. A cache would make revocation late, so there is none.
- A request that already passed authentication when the change committed finishes. "Immediately" means from the next request.

### User management

- `GET /api/users` lists accounts, paged (up to 100 per page) and searchable by name or email. It returns the ID, name, email, role, active flag and creation time.
- `PUT /api/users/{id}/role` and `PUT /api/users/{id}/status` are the only ways to change a role or active status. Registration always creates a `User`, and the seed admin is only created when there is no admin. Both endpoints go through one method in `UserService`. Under the user administration lock, that method:
  1. refuses any change to the admin's own account (403);
  2. re-checks, in the database, that the acting admin is still an active admin;
  3. refuses a change that would leave no active admin (409);
  4. sets a new stamp if anything changed, and commits.
- **The lock** is a SQL Server application lock, `users:administration`, taken like the booking locks in `ApplicationLocks` ([ADR 0002](0002-reservation-concurrency.md)). It serializes every role and status change, so the checks in steps 2 and 3 always see the others. A timeout returns 503 with `Retry-After`.
- **Why both steps 2 and 3:** without step 2, two admins demoting each other at the same moment would both pass authentication and both succeed, leaving no admin. With the lock and step 2, the second finds it is no longer an admin and gets 403. Given steps 1 and 2, step 3 can't currently fail, because the acting admin stays an active admin. It is kept so the rule doesn't depend on step 1, which could be relaxed later.
- `isActive` must be sent explicitly, so a request that leaves it out can't deactivate anyone (the trap audit L6 found in resources).

### Sign-in

The sign-in steps, in order:

1. **Find the user** by normalized email.
2. **Verify the password**, exactly once. Unknown emails are verified against a stand-in hash, as before.
3. **Wrong password or unknown email:** run the failure update and return the generic 401.
4. **Account locked:** return the generic 401, even for the right password.
5. **Account deactivated:** return 403, "This account has been deactivated." This only happens after the right password, so it reveals nothing to someone without it.
6. **Reset the failure count and issue a token** with one conditional `UPDATE`. It only matches if the account is still unlocked, still active and has the same stamp as when it was read. If anything changed since step 1, no token is issued and the answer is the generic 401.
7. **Re-hash an old-format password** with a compare-and-swap update that only matches the hash that was verified. A password changed meanwhile is never overwritten.

**The failure update** is one SQL statement:

```sql
UPDATE Users SET
  LockoutEndsAt    = CASE WHEN FailedLoginCount + 1 >= @max THEN @lockoutEnd ELSE NULL END,
  FailedLoginCount = CASE WHEN FailedLoginCount + 1 >= @max THEN 0 ELSE FailedLoginCount + 1 END
WHERE Email = @email AND (LockoutEndsAt IS NULL OR LockoutEndsAt <= @now)
```

- **Concurrent failures** each count exactly once. SQL Server locks the row for the statement, so no increment is lost.
- **Reaching the limit** sets the lockout and starts the count again.
- **During a lockout** the statement matches no row, so attempts don't extend the lockout. Otherwise an attacker could keep a user locked out indefinitely.
- **Unknown emails** run the same statement, which matches nothing. They still cost a similar round trip.

**What every failure looks like.** Unknown emails, wrong passwords and locked accounts all return the same `401` and the same message: "Invalid email or password. After repeated failed attempts, sign-in pauses for a few minutes." Each verifies one hash and runs one update. The message mentions the pause, because a locked-out user with the right password gets it too.

**Settings.** `AccountLockout:MaxFailedAttempts` (5) and `AccountLockout:LockoutMinutes` (15) are validated at startup.

## Consequences

- **Lockout is a denial-of-service lever.** Anyone who knows an email can lock that account for 15 minutes at a time. The per-IP rate limit slows this, and attempts during a lockout don't extend it, so an attacker must keep sending five failures every 15 minutes. Admins can't unlock an account by hand yet.
- **Revocation is limited to role and status changes.** Signing out is still client-side, so a copied token works until it expires unless its user changes. Server-side sign-out belongs with the cookie review in Milestone 7. Password resets in PR 4 will also rotate the stamp.
- **One extra query per authenticated request,** by primary key.
- **The failure update is a database write** for every failed attempt, including unknown emails. That adds a small, similar cost to each.
- **A concurrent change can turn the right password into the generic 401,** for example when a role changes during sign-in. That only happens in a narrow race, and signing in again works.
- **Sign-in tests moved to SQL Server integration tests,** because `ExecuteUpdate` doesn't run on EF's in-memory provider. Registration tests stay as unit tests.
- **`BookingLocks` became `ApplicationLocks`**, with the same booking lock names, order and timeout. `Scheduling:BookingLockTimeoutMilliseconds` is also how long an account change waits for its lock.
- **Registration still reveals existing emails** until email verification in PR 4 ([security](../security.md#account-enumeration)). Done: see [ADR 0011](0011-email-flows.md), which also makes password resets rotate the stamp, and stops unconfirmed accounts being made admins or counting as active admins.
