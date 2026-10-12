namespace ResourceReservation.Api.Services;

// The authenticated caller, independent of HTTP.
public sealed record CurrentUser(int UserId, bool IsAdmin);
