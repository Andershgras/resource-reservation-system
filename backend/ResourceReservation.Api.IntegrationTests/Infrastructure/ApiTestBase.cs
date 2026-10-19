using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
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

    // A browser-like client, with cookies and anti-forgery tokens.
    protected HttpClient CreateAnonymousClient()
    {
        return Fixture.Factory.CreateBrowserClient();
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

        Assert.Equal(HttpStatusCode.Accepted, registerResponse.StatusCode);
        await ConfirmEmailAsync(email);

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

    // A session for a token a test signs itself, so the token's other claims
    // decide whether it is accepted.
    protected async Task<Guid> CreateSessionAsync(int userId)
    {
        await using var context = Fixture.CreateDbContext();
        var session = new ResourceReservation.Api.Models.UserSession
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Client = ResourceReservation.Api.Models.UserSessionClients.Token,
            CreatedAt = DateTimeOffset.UtcNow,
            ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(10)
        };
        context.UserSessions.Add(session);
        await context.SaveChangesAsync();

        return session.Id;
    }

    // Marks a registered address as confirmed, as following its link would.
    protected async Task ConfirmEmailAsync(string email)
    {
        await using var context = Fixture.CreateDbContext();
        var user = await context.Users.SingleAsync(user => user.Email == email);
        user.IsEmailConfirmed = true;
        user.EmailConfirmedAt = DateTimeOffset.UtcNow;
        await context.SaveChangesAsync();
    }

    // A browser signed in with the session cookie, as the frontend is.
    protected async Task<HttpClient> CreateBrowserSessionClientAsync(string email, string password)
    {
        var client = CreateAnonymousClient();
        var loginResponse = await client.PostAsJsonAsync("/api/auth/login", new LoginUserDto
        {
            Email = email,
            Password = password
        });

        Assert.Equal(HttpStatusCode.OK, loginResponse.StatusCode);

        return client;
    }

    // Most tests use a bearer token from /api/auth/token, which is checked the
    // same way as the session cookie (ADR 0012).
    private async Task<HttpClient> CreateAuthenticatedClientAsync(string email, string password)
    {
        var client = CreateAnonymousClient();
        var tokenResponse = await client.PostAsJsonAsync("/api/auth/token", new LoginUserDto
        {
            Email = email,
            Password = password
        });

        Assert.Equal(HttpStatusCode.OK, tokenResponse.StatusCode);
        var auth = await tokenResponse.Content.ReadFromJsonAsync<AuthResponseDto>();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", auth!.Token);

        return client;
    }
}
