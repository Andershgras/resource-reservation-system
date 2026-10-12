using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using ResourceReservation.Api.Services;

namespace ResourceReservation.Api.Controllers;

public static class ControllerExtensions
{
    public const int RetryAfterSeconds = 5;

    public static CurrentUser? GetCurrentUser(this ClaimsPrincipal user)
    {
        var userIdValue = user.FindFirstValue(ClaimTypes.NameIdentifier);

        if (!int.TryParse(userIdValue, out var userId))
        {
            return null;
        }

        return new CurrentUser(userId, user.IsInRole("Admin"));
    }

    public static ObjectResult AuthenticationRequired(this ControllerBase controller)
    {
        return controller.ToErrorResult(ServiceError.Unauthorized("Authentication is required."));
    }

    public static ObjectResult ToErrorResult(this ControllerBase controller, ServiceError error)
    {
        var statusCode = error.Kind switch
        {
            ServiceErrorKind.Validation => StatusCodes.Status400BadRequest,
            ServiceErrorKind.Unauthorized => StatusCodes.Status401Unauthorized,
            ServiceErrorKind.NotFound => StatusCodes.Status404NotFound,
            ServiceErrorKind.Forbidden => StatusCodes.Status403Forbidden,
            ServiceErrorKind.Conflict => StatusCodes.Status409Conflict,
            ServiceErrorKind.Unavailable => StatusCodes.Status503ServiceUnavailable,
            _ => throw new ArgumentOutOfRangeException(nameof(error), error.Kind, null)
        };

        if (error.Kind == ServiceErrorKind.Unavailable)
        {
            controller.Response.Headers.RetryAfter = RetryAfterSeconds.ToString();
        }

        // Problem() fills in the RFC 9457 title, type and traceId for the status code.
        return controller.Problem(detail: error.Message, statusCode: statusCode);
    }
}
