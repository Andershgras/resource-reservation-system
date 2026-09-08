using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ResourceReservation.Api.Controllers;
using ResourceReservation.Api.Data;
using ResourceReservation.Api.DTOs;

namespace ResourceReservation.Api.Tests;

public class ResourcesControllerTests
{
    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task CreateResource_WhenNameIsMissing_ReturnsBadRequest(string name)
    {
        await using var context = CreateContext();
        var controller = new ResourcesController(context);

        var result = await controller.CreateResource(new CreateResourceDto
        {
            Name = name
        });

        var badRequest = Assert.IsType<BadRequestObjectResult>(result.Result);
        AssertApiError(badRequest, "Name is required.");
    }

    [Fact]
    public async Task CreateResource_WhenNameHasOuterWhitespace_TrimsNameBeforeSaving()
    {
        await using var context = CreateContext();
        var controller = new ResourcesController(context);

        var result = await controller.CreateResource(new CreateResourceDto
        {
            Name = "  Meeting Room  ",
            Description = "  Shared workspace  ",
            Location = "  Floor 2  "
        });

        var created = Assert.IsType<CreatedAtActionResult>(result.Result);
        var response = Assert.IsType<ResourceResponseDto>(created.Value);
        Assert.Equal("Meeting Room", response.Name);

        var savedResource = await context.Resources.FindAsync(response.Id);
        Assert.NotNull(savedResource);
        Assert.Equal("Meeting Room", savedResource.Name);
    }

    private static AppDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        return new AppDbContext(options);
    }

    private static void AssertApiError(ObjectResult objectResult, string expectedMessage)
    {
        var error = Assert.IsType<ApiErrorResponseDto>(objectResult.Value);
        Assert.Equal(expectedMessage, error.Message);
    }
}
