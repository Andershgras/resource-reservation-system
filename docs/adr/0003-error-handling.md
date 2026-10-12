# ADR 0003: Problem Details For Errors And Result Types For Expected Failures

- **Status:** Accepted
- **Date:** 2026-10-12
- **Related findings:** M1 and M6 in the [initial audit](../audit/2026-10-initial-audit.md)

## Context

Before Milestone 2, errors were returned as a custom `{ message, errors }` body. Five controllers each built that body with their own copy of an `ApiError` helper. Unhandled exceptions produced the framework's default 500, in a different shape. The JWT middleware wrote its own JSON for 401 and 403.

Business rules lived in the controllers. Each rule violation was expressed as an HTTP result directly, so the rules couldn't be tested or reused without HTTP.

## Decision

### Error format: RFC 9457 problem details

Every error response is `application/problem+json`:

- Service and CRUD errors go through one helper, `ControllerExtensions.ToErrorResult`. It calls MVC's `Problem()`, which fills in `type`, `title` and `traceId`.
- Model validation errors use the standard `ValidationProblemDetails`, which adds `errors` keyed by field.
- 401 and 403 from the JWT middleware are written through `IProblemDetailsService`.
- `UseExceptionHandler()` logs unhandled exceptions and returns a 500 problem with no exception details.

This was preferred over keeping `{ message, errors }`. It's a recognised standard with built-in ASP.NET Core support, every error now has one shape, and `traceId` links a user's error report to the server logs.

### Expected failures: result types

Services return `ServiceResult<T>` (or `ServiceResult` when there's no value). A result holds either a value or a `ServiceError(Kind, Message)`. The kinds map to HTTP statuses in one place:

| Kind | Status |
|---|---|
| `Validation` | 400 |
| `Unauthorized` | 401 |
| `Forbidden` | 403 |
| `NotFound` | 404 |
| `Conflict` | 409 |
| `Unavailable` | 503, plus `Retry-After` |

Exceptions are reserved for unexpected failures. This was preferred over throwing domain exceptions and mapping them in middleware for three reasons:

- An overlap or a slot in the past is a normal outcome, not an exceptional one.
- The outcomes are visible in method signatures and easy to assert in unit tests.
- Control flow stays local and explicit.

## Consequences

- **Breaking API change:** clients that read `message` must read `detail`, or the `errors` values for validation. The project's own frontend was updated in the same change, and its Playwright mocks use the new shape.
- **Message wording:** validation messages for missing or malformed fields come from DataAnnotations' default wording, such as "The Name field is required." Custom messages on the DTO attributes would read better. This is a UX follow-up.
- **New errors:** adding an error kind means adding one enum value and one line in `ToErrorResult`.
- **Testing:** controller unit tests need an `HttpContext` with MVC services so `Problem()` works. `ControllerTestSupport.WithHttpContext()` provides it.
