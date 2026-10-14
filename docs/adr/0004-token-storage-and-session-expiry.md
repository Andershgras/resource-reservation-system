# ADR 0004: Keep The Token In localStorage And Handle Session Expiry In The Frontend

- **Status:** Accepted for Milestone 3. To be reviewed before any public deployment (Milestone 7).
- **Date:** 2026-10-12
- **Related findings:** M3 in the [initial audit](../audit/2026-10-initial-audit.md)

## Context

The frontend stores the JWT in `localStorage` and sends it as a bearer token. Before Milestone 3, it restored the user from storage without checking whether the token had expired, and it treated a `401` like any other error. After the token's two-hour lifetime, the user still looked logged in, but every action failed with "Authentication is required."

There were two ways to fix this:

1. **Keep `localStorage`** and add proper expiry handling.
2. **Move the token to an httpOnly cookie.** Scripts can't read such a cookie, which protects the token against XSS. But it means cookie authentication on the API, CSRF protection, and CORS with credentials, and it changes how the frontend client works.

## Decision

Keep the token in `localStorage` for now, and handle expiry properly:

- **Expiry in the login response:** the API now returns `expiresAt` (UTC) and `expiresInSeconds`.
- **Timed on the browser's clock:** the frontend measures the session from `expiresInSeconds`. If it used the absolute `expiresAt`, a device with a wrong clock could end every session the moment it started, or never end it.
- **Restoring:** a stored session is only restored while it's valid. Sessions saved before this change have no expiry time, so they count as expired.
- **Timer:** a timer ends the session when its lifetime runs out.
- **Rejected tokens:** a `401` for a request that sent a token ends the session. A `401` without a token is an ordinary error.
- **No loops or wrong logouts:**
  - Only the session that sent the rejected token is ended, so a late response from an older session can't log out a newer one.
  - The login screen makes no authenticated requests, so returning to it can't trigger another logout.

The cookie option was deferred, not rejected. It is a much larger change, and it fits better when Milestone 7 decides how the frontend and API are hosted. If they share one origin, cookies need no CORS with credentials and CSRF protection becomes simpler.

## Consequences

- **XSS still exposes the token.** Any script running on the frontend's origin can read it. The API's security headers don't protect the frontend's JavaScript. React's escaping and the short token lifetime reduce the risk, but don't remove it. **Before public deployment, review httpOnly cookies and a strict Content-Security-Policy for the frontend.** This is tracked in the roadmap for Milestone 7.
- **Logout is client-side only.** A copied token stays valid until it expires. Since Milestone 6 PR 3, a role change or deactivation revokes the user's tokens, because every request checks the token's security stamp against the database ([ADR 0010](0010-user-management-and-account-security.md)). The frontend's handling of a `401` signs such users out.
- **Everyone logs in once more:** existing stored sessions have no expiry time, so they are discarded after this change.
- **Third-party clients** can use `expiresInSeconds` or `expiresAt` to know when to log in again. Both fields are additions, so existing clients aren't affected.
