using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.IntegrationTests.Infrastructure;

namespace ResourceReservation.Api.IntegrationTests;

public class RegistrationTests : ApiTestBase
{
    public RegistrationTests(ApiFixture fixture)
        : base(fixture)
    {
    }

    [Fact]
    public async Task Register_WhenSameEmailIsRegisteredInParallel_OnlyOneSucceeds()
    {
        const int parallelRequests = 10;
        const string email = "race@integration.test";
        var client = CreateAnonymousClient();

        var responses = await Task.WhenAll(Enumerable.Range(0, parallelRequests)
            .Select(index => client.PostAsJsonAsync("/api/auth/register", new RegisterUserDto
            {
                Name = $"Racer {index}",
                Email = email,
                Password = "Password123"
            })));

        var statusCodes = responses.Select(response => response.StatusCode).ToList();
        Assert.Equal(1, statusCodes.Count(status => status == HttpStatusCode.Created));
        Assert.Equal(parallelRequests - 1, statusCodes.Count(status => status == HttpStatusCode.BadRequest));

        await using var context = Fixture.CreateDbContext();
        Assert.Equal(1, await context.Users.CountAsync(user => user.Email == email));
    }

    [Fact]
    public async Task Register_WithMixedCaseEmail_StoresNormalizedEmailAndAllowsLogin()
    {
        var client = CreateAnonymousClient();

        var registerResponse = await client.PostAsJsonAsync("/api/auth/register", new RegisterUserDto
        {
            Name = "Mixed Case",
            Email = "  Mixed.Case@Integration.Test ",
            Password = "Password123"
        });
        var loginResponse = await client.PostAsJsonAsync("/api/auth/login", new LoginUserDto
        {
            Email = "MIXED.CASE@integration.test",
            Password = "Password123"
        });

        Assert.Equal(HttpStatusCode.Created, registerResponse.StatusCode);
        Assert.Equal(HttpStatusCode.OK, loginResponse.StatusCode);
        await using var context = Fixture.CreateDbContext();
        Assert.True(await context.Users.AnyAsync(user => user.Email == "mixed.case@integration.test"));
    }
}
