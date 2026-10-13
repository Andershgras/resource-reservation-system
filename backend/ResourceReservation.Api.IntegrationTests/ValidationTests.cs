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
    public async Task Register_WithEmptyBody_ReturnsFriendlyMessagePerField()
    {
        var client = CreateAnonymousClient();

        var response = await client.PostAsJsonAsync("/api/auth/register", new { name = "", email = "", password = "" });

        var problem = await ProblemAssert.IsProblemAsync<ValidationProblemDetails>(
            response,
            HttpStatusCode.BadRequest);
        // An empty email or password also fails [EmailAddress] or [MinLength].
        // The required message comes first, and the frontend shows the first
        // message for each field.
        Assert.Equal("Enter your name.", problem.Errors["Name"][0]);
        Assert.Equal("Enter your email address.", problem.Errors["Email"][0]);
        Assert.Equal("Enter a password.", problem.Errors["Password"][0]);
    }

    [Fact]
    public async Task Register_WithInvalidValues_ReturnsFriendlyMessagePerField()
    {
        var client = CreateAnonymousClient();

        var response = await client.PostAsJsonAsync("/api/auth/register", new
        {
            name = new string('a', 101),
            email = "not-an-email",
            password = "short1"
        });

        var problem = await ProblemAssert.IsProblemAsync<ValidationProblemDetails>(
            response,
            HttpStatusCode.BadRequest);
        Assert.Equal(["Name must be 100 characters or fewer."], problem.Errors["Name"]);
        Assert.Equal(["Enter a valid email address."], problem.Errors["Email"]);
        Assert.Equal(["Password must be at least 8 characters."], problem.Errors["Password"]);
    }

    [Fact]
    public async Task CreateResource_WithTooLongFields_ReturnsFriendlyMessagePerField()
    {
        var client = await CreateAdminClientAsync();

        var response = await client.PostAsJsonAsync("/api/resources", new
        {
            name = "",
            description = new string('a', 501),
            location = new string('a', 201)
        });

        var problem = await ProblemAssert.IsProblemAsync<ValidationProblemDetails>(
            response,
            HttpStatusCode.BadRequest);
        Assert.Equal(["Enter a resource name."], problem.Errors["Name"]);
        Assert.Equal(["Description must be 500 characters or fewer."], problem.Errors["Description"]);
        Assert.Equal(["Location must be 200 characters or fewer."], problem.Errors["Location"]);
    }

    [Fact]
    public async Task CreateAvailabilityRule_WithoutResourceOrValidDay_ReturnsFriendlyMessagePerField()
    {
        var client = await CreateAdminClientAsync();

        var response = await client.PostAsJsonAsync("/api/availabilityrules", new
        {
            resourceId = 0,
            dayOfWeek = 7,
            startTime = "08:00:00",
            endTime = "16:00:00"
        });

        var problem = await ProblemAssert.IsProblemAsync<ValidationProblemDetails>(
            response,
            HttpStatusCode.BadRequest);
        Assert.Equal(["Select a resource."], problem.Errors["ResourceId"]);
        Assert.Equal(["Select a weekday."], problem.Errors["DayOfWeek"]);
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
