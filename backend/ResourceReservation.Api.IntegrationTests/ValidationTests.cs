using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc;
using ResourceReservation.Api.IntegrationTests.Infrastructure;

namespace ResourceReservation.Api.IntegrationTests;

public class ValidationTests : ApiTestBase
{
    public ValidationTests(ApiFixture fixture)
        : base(fixture)
    {
    }

    [Fact]
    public async Task Register_WithEmptyBody_ReturnsValidationProblemWithErrorsPerField()
    {
        var client = CreateAnonymousClient();

        var response = await client.PostAsJsonAsync("/api/auth/register", new { });

        var problem = await ProblemAssert.IsProblemAsync<ValidationProblemDetails>(
            response,
            HttpStatusCode.BadRequest);
        Assert.Contains(problem.Errors.Keys, key => key.Equals("Name", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(problem.Errors.Keys, key => key.Equals("Email", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(problem.Errors.Keys, key => key.Equals("Password", StringComparison.OrdinalIgnoreCase));
        Assert.All(problem.Errors.Values, messages => Assert.NotEmpty(messages));
    }

    [Fact]
    public async Task BusinessRuleViolation_ReturnsProblemWithDetail()
    {
        var client = await CreateUserClientAsync();

        var response = await client.PostAsJsonAsync("/api/reservations", new
        {
            resourceId = 999,
            startTime = BookingDay.AddHours(9),
            endTime = BookingDay.AddHours(10)
        });

        await ProblemAssert.IsProblemAsync(response, HttpStatusCode.BadRequest, "Resource does not exist.");
    }
}
