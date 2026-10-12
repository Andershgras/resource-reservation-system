using Microsoft.EntityFrameworkCore;
using ResourceReservation.Api.IntegrationTests.Infrastructure;

namespace ResourceReservation.Api.IntegrationTests;

public class DatabaseSchemaTests : ApiTestBase
{
    public DatabaseSchemaTests(ApiFixture fixture)
        : base(fixture)
    {
    }

    [Fact]
    public async Task Migrations_AreFullyAppliedAndMatchTheModel()
    {
        await using var context = Fixture.CreateDbContext();

        Assert.Empty(await context.Database.GetPendingMigrationsAsync());
        Assert.False(context.Database.HasPendingModelChanges());
    }
}
