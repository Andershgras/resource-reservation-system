using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using ResourceReservation.Api.Controllers;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.Services;

namespace ResourceReservation.Api.Tests;

public class ControllerExtensionsTests
{
    [Fact]
    public void GetCurrentUser_WhenUserIdClaimIsMissing_ReturnsNull()
    {
        var user = new ClaimsPrincipal(new ClaimsIdentity([], "TestAuth"));

        Assert.Null(user.GetCurrentUser());
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void GetCurrentUser_WithUserIdClaim_ReturnsUserAndAdminFlag(bool isAdmin)
    {
        var claims = new List<Claim> { new(ClaimTypes.NameIdentifier, "42") };

        if (isAdmin)
        {
            claims.Add(new Claim(ClaimTypes.Role, "Admin"));
        }

        var user = new ClaimsPrincipal(new ClaimsIdentity(claims, "TestAuth"));

        Assert.Equal(new CurrentUser(42, isAdmin), user.GetCurrentUser());
    }

    [Theory]
    [InlineData(ServiceErrorKind.Validation, StatusCodes.Status400BadRequest)]
    [InlineData(ServiceErrorKind.Unauthorized, StatusCodes.Status401Unauthorized)]
    [InlineData(ServiceErrorKind.Forbidden, StatusCodes.Status403Forbidden)]
    [InlineData(ServiceErrorKind.NotFound, StatusCodes.Status404NotFound)]
    [InlineData(ServiceErrorKind.Conflict, StatusCodes.Status409Conflict)]
    [InlineData(ServiceErrorKind.Unavailable, StatusCodes.Status503ServiceUnavailable)]
    public void ToErrorResult_MapsEachErrorKindToItsStatusCode(ServiceErrorKind kind, int expectedStatusCode)
    {
        var controller = CreateController();

        var result = controller.ToErrorResult(new ServiceError(kind, "Message"));

        Assert.Equal(expectedStatusCode, result.StatusCode);
        Assert.Equal("Message", Assert.IsType<ApiErrorResponseDto>(result.Value).Message);
    }

    [Fact]
    public void ToErrorResult_WhenUnavailable_SetsRetryAfterHeader()
    {
        var controller = CreateController();

        controller.ToErrorResult(ServiceError.Unavailable("Busy"));

        Assert.Equal("5", controller.Response.Headers.RetryAfter.ToString());
    }

    private static TestController CreateController()
    {
        return new TestController
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
        };
    }

    private sealed class TestController : ControllerBase
    {
    }
}
