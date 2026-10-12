using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using ResourceReservation.Api.DTOs;

namespace ResourceReservation.Api.IntegrationTests.Infrastructure;

[Collection(ApiCollection.Name)]
public abstract class ApiTestBase : IAsyncLifetime
{
    // A Wednesday far enough ahead that it is always in the future.
    protected static readonly DateTime BookingDay = new(2030, 1, 16);

    protected ApiTestBase(ApiFixture fixture)
    {
        Fixture = fixture;
    }

    protected ApiFixture Fixture { get; }

    public Task InitializeAsync()
    {
        return Fixture.ResetDatabaseAsync();
    }

    public Task DisposeAsync()
    {
        return Task.CompletedTask;
    }

    protected HttpClient CreateAnonymousClient()
    {
        return Fixture.Factory.CreateClient();
    }

    protected Task<HttpClient> CreateAdminClientAsync()
    {
        return CreateAuthenticatedClientAsync(ApiFixture.AdminEmail, ApiFixture.AdminPassword);
    }

    protected async Task<HttpClient> CreateUserClientAsync(string email = "user@integration.test")
    {
        const string password = "UserPassword123";
        var client = CreateAnonymousClient();
        var registerResponse = await client.PostAsJsonAsync("/api/auth/register", new RegisterUserDto
        {
            Name = "Integration User",
            Email = email,
            Password = password
        });

        Assert.Equal(HttpStatusCode.Created, registerResponse.StatusCode);

        return await CreateAuthenticatedClientAsync(email, password);
    }

    protected async Task<int> CreateResourceWithWeeklyRuleAsync(
        HttpClient adminClient,
        TimeOnly startTime,
        TimeOnly endTime)
    {
        var resourceResponse = await adminClient.PostAsJsonAsync("/api/resources", new CreateResourceDto
        {
            Name = "Integration Room"
        });
        Assert.Equal(HttpStatusCode.Created, resourceResponse.StatusCode);
        var resource = await resourceResponse.Content.ReadFromJsonAsync<ResourceResponseDto>();

        var ruleResponse = await adminClient.PostAsJsonAsync("/api/availabilityrules", new CreateAvailabilityRuleDto
        {
            ResourceId = resource!.Id,
            DayOfWeek = (int)BookingDay.DayOfWeek,
            StartTime = startTime,
            EndTime = endTime
        });
        Assert.Equal(HttpStatusCode.Created, ruleResponse.StatusCode);

        return resource.Id;
    }

    private async Task<HttpClient> CreateAuthenticatedClientAsync(string email, string password)
    {
        var client = CreateAnonymousClient();
        var loginResponse = await client.PostAsJsonAsync("/api/auth/login", new LoginUserDto
        {
            Email = email,
            Password = password
        });

        Assert.Equal(HttpStatusCode.OK, loginResponse.StatusCode);
        var auth = await loginResponse.Content.ReadFromJsonAsync<AuthResponseDto>();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", auth!.Token);

        return client;
    }
}
