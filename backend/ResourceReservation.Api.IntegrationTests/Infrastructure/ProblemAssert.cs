using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc;

namespace ResourceReservation.Api.IntegrationTests.Infrastructure;

public static class ProblemAssert
{
    // Asserts an RFC 9457 problem response and returns it for further checks.
    public static async Task<T> IsProblemAsync<T>(
        HttpResponseMessage response,
        HttpStatusCode expectedStatus,
        string? expectedDetail = null)
        where T : ProblemDetails
    {
        Assert.Equal(expectedStatus, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);

        var problem = await response.Content.ReadFromJsonAsync<T>();

        Assert.NotNull(problem);
        Assert.Equal((int)expectedStatus, problem.Status);
        Assert.False(string.IsNullOrWhiteSpace(problem.Title));
        Assert.True(problem.Extensions.ContainsKey("traceId"), "Problem response has no traceId.");

        if (expectedDetail is not null)
        {
            Assert.Equal(expectedDetail, problem.Detail);
        }

        return problem;
    }

    public static Task<ProblemDetails> IsProblemAsync(
        HttpResponseMessage response,
        HttpStatusCode expectedStatus,
        string? expectedDetail = null)
    {
        return IsProblemAsync<ProblemDetails>(response, expectedStatus, expectedDetail);
    }
}
