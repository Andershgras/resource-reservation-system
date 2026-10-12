using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;

namespace ResourceReservation.Api.Tests;

internal static class ControllerTestSupport
{
    // Real MVC services, so Problem() can resolve its ProblemDetailsFactory.
    private static readonly IServiceProvider MvcServices = new ServiceCollection()
        .AddLogging()
        .AddControllers()
        .Services
        .BuildServiceProvider();

    public static T WithHttpContext<T>(this T controller, ClaimsPrincipal? user = null)
        where T : ControllerBase
    {
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                RequestServices = MvcServices,
                User = user ?? new ClaimsPrincipal()
            }
        };

        return controller;
    }
}

internal static class ProblemAssert
{
    public static ProblemDetails IsProblem(IActionResult? result, int expectedStatusCode, string expectedDetail)
    {
        var objectResult = Assert.IsAssignableFrom<ObjectResult>(result);
        var problem = Assert.IsAssignableFrom<ProblemDetails>(objectResult.Value);

        Assert.Equal(expectedStatusCode, objectResult.StatusCode);
        Assert.Equal(expectedStatusCode, problem.Status);
        Assert.Equal(expectedDetail, problem.Detail);
        Assert.False(string.IsNullOrWhiteSpace(problem.Title));

        return problem;
    }
}
