using System.Net;
using System.Net.Http.Json;
using ResourceReservation.Api.IntegrationTests.Infrastructure;

namespace ResourceReservation.Api.IntegrationTests;

public class ValidationTests : ApiTestBase
{
    public ValidationTests(ApiFixture fixture)
        : base(fixture)
    {
    }

    [Fact]
    public async Task Register_WithEmptyBody_ReturnsValidationErrorsPerField()
    {
        var client = CreateAnonymousClient();

        var response = await client.PostAsJsonAsync("/api/auth/register", new { });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var error = await response.Content.ReadFromJsonAsync<ValidationErrorResponse>();
        Assert.Equal("Validation failed.", error?.Message);
        Assert.NotNull(error?.Errors);
        Assert.Contains(error.Errors.Keys, key => key.Equals("Name", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(error.Errors.Keys, key => key.Equals("Email", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(error.Errors.Keys, key => key.Equals("Password", StringComparison.OrdinalIgnoreCase));
    }

    private sealed record ValidationErrorResponse(
        string? Message,
        Dictionary<string, string[]>? Errors);
}
