using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.IntegrationTests.Infrastructure;
using ResourceReservation.Api.Models;
using ResourceReservation.Api.Services;

namespace ResourceReservation.Api.IntegrationTests;

// Admin user management, and existing tokens losing access as soon as their
// user's role or status changes (ADR 0010).
public class UserManagementTests : ApiTestBase
{
    private const string SecondAdminEmail = "second-admin@integration.test";
    private const string UserEmail = "user@integration.test";
    private const string Password = "UserPassword123";

    public UserManagementTests(ApiFixture fixture)
        : base(fixture)
    {
    }

    [Fact]
    public async Task ADemotedAdmin_LosesAccessAtOnceWithTheTokenTheyAlreadyHave()
    {
        var adminClient = await CreateAdminClientAsync();
        var secondAdmin = await SeedUserAsync(SecondAdminEmail, UserRoles.Admin);
        var secondAdminClient = await SignInAsync(SecondAdminEmail);
        Assert.Equal(HttpStatusCode.OK, (await secondAdminClient.GetAsync("/api/users")).StatusCode);

        var demote = await ChangeRoleAsync(adminClient, secondAdmin.Id, UserRoles.User);

        Assert.Equal(HttpStatusCode.OK, demote.StatusCode);
        await ProblemAssert.IsProblemAsync(
            await secondAdminClient.GetAsync("/api/users"),
            HttpStatusCode.Unauthorized,
            "Authentication is required.");
        // The whole session ends, not only admin access.
        Assert.Equal(HttpStatusCode.Unauthorized, (await secondAdminClient.GetAsync("/api/reservations/me")).StatusCode);
        // Signing in again gives a user's token.
        var asUser = await SignInAsync(SecondAdminEmail);
        Assert.Equal(HttpStatusCode.Forbidden, (await asUser.GetAsync("/api/users")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await asUser.GetAsync("/api/reservations/me")).StatusCode);
    }

    [Fact]
    public async Task APromotedUser_SignsInAgainToBecomeAdmin()
    {
        var adminClient = await CreateAdminClientAsync();
        var user = await SeedUserAsync(UserEmail);
        var userClient = await SignInAsync(UserEmail);

        await ChangeRoleAsync(adminClient, user.Id, UserRoles.Admin);

        Assert.Equal(HttpStatusCode.Unauthorized, (await userClient.GetAsync("/api/reservations/me")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await (await SignInAsync(UserEmail)).GetAsync("/api/users")).StatusCode);
    }

    [Fact]
    public async Task ADeactivatedUser_LosesAccessAtOnceAndKeepsTheirReservations()
    {
        var adminClient = await CreateAdminClientAsync();
        var resourceId = await CreateResourceWithWeeklyRuleAsync(adminClient, new TimeOnly(8, 0), new TimeOnly(16, 0));
        var user = await SeedUserAsync(UserEmail);
        var userClient = await SignInAsync(UserEmail);
        var booking = await userClient.PostAsJsonAsync("/api/reservations", new CreateReservationDto
        {
            ResourceId = resourceId,
            StartTime = BookingDay.AddHours(9),
            EndTime = BookingDay.AddHours(10)
        });
        Assert.Equal(HttpStatusCode.Created, booking.StatusCode);

        var deactivate = await ChangeStatusAsync(adminClient, user.Id, false);

        Assert.False((await deactivate.Content.ReadFromJsonAsync<UserAccountResponseDto>())!.IsActive);
        Assert.Equal(HttpStatusCode.Unauthorized, (await userClient.GetAsync("/api/reservations/me")).StatusCode);
        await ProblemAssert.IsProblemAsync(
            await SignInResponseAsync(UserEmail),
            HttpStatusCode.Forbidden,
            AuthService.DeactivatedMessage);
        var kept = await adminClient.GetFromJsonAsync<List<ReservationResponseDto>>($"/api/reservations/user/{user.Id}");
        Assert.Equal(ReservationStatuses.Active, Assert.Single(kept!).Status);
    }

    [Fact]
    public async Task AReactivatedUser_CanSignInAgain()
    {
        var adminClient = await CreateAdminClientAsync();
        var user = await SeedUserAsync(UserEmail, isActive: false);

        Assert.Equal(HttpStatusCode.OK, (await ChangeStatusAsync(adminClient, user.Id, true)).StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await SignInResponseAsync(UserEmail)).StatusCode);
    }

    [Fact]
    public async Task AChangeThatChangesNothing_KeepsExistingSessions()
    {
        var adminClient = await CreateAdminClientAsync();
        var user = await SeedUserAsync(UserEmail);
        var userClient = await SignInAsync(UserEmail);

        await ChangeRoleAsync(adminClient, user.Id, UserRoles.User);
        await ChangeStatusAsync(adminClient, user.Id, true);

        Assert.Equal(HttpStatusCode.OK, (await userClient.GetAsync("/api/reservations/me")).StatusCode);
    }

    [Fact]
    public async Task Tokens_AreRejectedWithoutAStampOrWithAnotherRole()
    {
        var user = await SeedUserAsync(UserEmail);
        var fingerprint = UserSessionValidator.FingerprintSecurityStamp(user.SecurityStamp);
        // A real session, so only the stamp and the role decide.
        var sessionId = await CreateSessionAsync(user.Id);

        var noStamp = await GetMyReservationsWithAsync(CreateToken(user.Id, UserRoles.User, null, sessionId));
        var wrongStamp = await GetMyReservationsWithAsync(CreateToken(user.Id, UserRoles.User, new string('0', 64), sessionId));
        // A stamp fingerprint can't be used to claim another role.
        var otherRole = await CreateAnonymousClientWithToken(CreateToken(user.Id, UserRoles.Admin, fingerprint, sessionId))
            .GetAsync("/api/users");
        var valid = await GetMyReservationsWithAsync(CreateToken(user.Id, UserRoles.User, fingerprint, sessionId));

        Assert.Equal(
            [HttpStatusCode.Unauthorized, HttpStatusCode.Unauthorized, HttpStatusCode.Unauthorized, HttpStatusCode.OK],
            [noStamp.StatusCode, wrongStamp.StatusCode, otherRole.StatusCode, valid.StatusCode]);
    }

    [Fact]
    public async Task Admins_CannotChangeTheirOwnAccount()
    {
        var adminClient = await CreateAdminClientAsync();
        var adminId = await GetUserIdAsync(ApiFixture.AdminEmail);

        await ProblemAssert.IsProblemAsync(
            await ChangeRoleAsync(adminClient, adminId, UserRoles.User),
            HttpStatusCode.Forbidden,
            UserService.OwnAccountMessage);
        await ProblemAssert.IsProblemAsync(
            await ChangeStatusAsync(adminClient, adminId, false),
            HttpStatusCode.Forbidden,
            UserService.OwnAccountMessage);
        Assert.Equal(HttpStatusCode.OK, (await adminClient.GetAsync("/api/users")).StatusCode);
    }

    // Two admins remove each other at the same moment. Without the lock both
    // could succeed and leave no admin. With it, the second finds it is no
    // longer an admin.
    [Theory]
    [InlineData("role")]
    [InlineData("status")]
    public async Task TwoAdminsRemovingEachOtherAtOnce_LeaveOneActiveAdmin(string change)
    {
        var adminClient = await CreateAdminClientAsync();
        var adminId = await GetUserIdAsync(ApiFixture.AdminEmail);
        var secondAdmin = await SeedUserAsync(SecondAdminEmail, UserRoles.Admin);
        var secondAdminClient = await SignInAsync(SecondAdminEmail);
        var heldLock = await HoldUserAdministrationLockAsync();

        var first = Remove(adminClient, secondAdmin.Id);
        var second = Remove(secondAdminClient, adminId);
        await WaitForLockRequestsAsync(2);
        await heldLock.DisposeAsync();
        var responses = await Task.WhenAll(first, second);

        Assert.Equal(
            [HttpStatusCode.OK, HttpStatusCode.Forbidden],
            responses.Select(response => response.StatusCode).Order());
        Assert.Equal(1, await CountActiveAdminsAsync());

        Task<HttpResponseMessage> Remove(HttpClient client, int userId) => change == "role"
            ? ChangeRoleAsync(client, userId, UserRoles.User)
            : ChangeStatusAsync(client, userId, false);
    }

    // An admin who is demoted while their request waits can't finish it.
    [Fact]
    public async Task AnAdminDemotedWhileTheirRequestWaits_IsRefused()
    {
        var adminClient = await CreateAdminClientAsync();
        var secondAdmin = await SeedUserAsync(SecondAdminEmail, UserRoles.Admin);
        var secondAdminClient = await SignInAsync(SecondAdminEmail);
        var user = await SeedUserAsync(UserEmail);
        var heldLock = await HoldUserAdministrationLockAsync();

        var promote = ChangeRoleAsync(secondAdminClient, user.Id, UserRoles.Admin);
        await WaitForLockRequestsAsync(1);
        await using (var context = Fixture.CreateDbContext())
        {
            var stored = await context.Users.SingleAsync(candidate => candidate.Id == secondAdmin.Id);
            stored.Role = UserRoles.User;
            stored.SecurityStamp = User.NewSecurityStamp();
            await context.SaveChangesAsync();
        }

        await heldLock.DisposeAsync();

        await ProblemAssert.IsProblemAsync(await promote, HttpStatusCode.Forbidden);
        Assert.Equal(UserRoles.User, (await ReloadAsync(user.Id)).Role);
    }

    [Fact]
    public async Task AChange_WaitsForTheLockAndReports503WhenItTimesOut()
    {
        var adminClient = await CreateAdminClientAsync();
        var user = await SeedUserAsync(UserEmail);
        await using var shortTimeoutFactory = new ApiFactory(
            Fixture.ConnectionString,
            new Dictionary<string, string> { ["Scheduling:BookingLockTimeoutMilliseconds"] = "500" });
        var client = shortTimeoutFactory.CreateBrowserClient();
        client.DefaultRequestHeaders.Authorization = adminClient.DefaultRequestHeaders.Authorization;
        var heldLock = await HoldUserAdministrationLockAsync();

        var busy = await ChangeStatusAsync(client, user.Id, false);

        await ProblemAssert.IsProblemAsync(busy, HttpStatusCode.ServiceUnavailable, UserService.BusyMessage);
        Assert.True(busy.Headers.Contains("Retry-After"));
        Assert.True((await ReloadAsync(user.Id)).IsActive);
        await heldLock.DisposeAsync();
        Assert.Equal(HttpStatusCode.OK, (await ChangeStatusAsync(client, user.Id, false)).StatusCode);
    }

    [Fact]
    public async Task UserList_IsPagedSearchableAndNeverShowsSecrets()
    {
        var adminClient = await CreateAdminClientAsync();
        await SeedUserAsync("anna@integration.test", name: "Anna Berg");
        await SeedUserAsync("bo@integration.test", name: "Bo Dahl", isActive: false);
        await SeedUserAsync("carl@example.org", name: "Carl Eng");

        var firstPage = await adminClient.GetFromJsonAsync<UserAccountPageResponseDto>("/api/users?pageSize=2");
        var secondPage = await adminClient.GetFromJsonAsync<UserAccountPageResponseDto>("/api/users?pageSize=2&page=2");
        var search = await adminClient.GetFromJsonAsync<UserAccountPageResponseDto>("/api/users?search=EXAMPLE.org");
        var json = await adminClient.GetStringAsync("/api/users");

        Assert.Equal(["Anna Berg", "Bo Dahl"], firstPage!.Items.Select(user => user.Name));
        Assert.Equal((4, 1, 2), (firstPage.TotalCount, firstPage.Page, firstPage.PageSize));
        Assert.Equal(["Carl Eng", "Integration Admin"], secondPage!.Items.Select(user => user.Name));
        Assert.Equal("Carl Eng", Assert.Single(search!.Items).Name);
        Assert.False(firstPage.Items[1].IsActive);
        Assert.Equal(
            ["createdAt", "email", "id", "isActive", "isEmailConfirmed", "name", "role"],
            JsonDocument.Parse(json).RootElement.GetProperty("items")[0]
                .EnumerateObject().Select(property => property.Name).Order());
    }

    [Fact]
    public async Task UserManagement_IsForAdminsOnly()
    {
        var user = await SeedUserAsync(UserEmail);
        var userClient = await SignInAsync(UserEmail);

        Assert.Equal(HttpStatusCode.Unauthorized, (await CreateAnonymousClient().GetAsync("/api/users")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await userClient.GetAsync("/api/users")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await ChangeRoleAsync(userClient, user.Id, UserRoles.Admin)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await ChangeStatusAsync(userClient, user.Id, true)).StatusCode);
        Assert.Equal(UserRoles.User, (await ReloadAsync(user.Id)).Role);
    }

    [Fact]
    public async Task Changes_AreValidated()
    {
        var adminClient = await CreateAdminClientAsync();
        var user = await SeedUserAsync(UserEmail);

        var badRole = await adminClient.PutAsJsonAsync($"/api/users/{user.Id}/role", new { role = "Owner" });
        // Leaving isActive out must not deactivate anyone (audit L6).
        var missingStatus = await adminClient.PutAsJsonAsync($"/api/users/{user.Id}/status", new { });
        var unknownUser = await ChangeStatusAsync(adminClient, 999999, false);

        Assert.Equal(HttpStatusCode.BadRequest, badRole.StatusCode);
        Assert.Contains("Choose User or Admin.", await badRole.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.BadRequest, missingStatus.StatusCode);
        Assert.Contains("Choose whether the account is active.", await missingStatus.Content.ReadAsStringAsync());
        await ProblemAssert.IsProblemAsync(unknownUser, HttpStatusCode.NotFound, UserService.UserNotFoundMessage);
        Assert.True((await ReloadAsync(user.Id)).IsActive);
        Assert.Equal(
            HttpStatusCode.BadRequest,
            (await adminClient.GetAsync("/api/users?pageSize=101")).StatusCode);
    }

    private static Task<HttpResponseMessage> ChangeRoleAsync(HttpClient client, int userId, string role)
    {
        return client.PutAsJsonAsync($"/api/users/{userId}/role", new ChangeUserRoleDto { Role = role });
    }

    private static Task<HttpResponseMessage> ChangeStatusAsync(HttpClient client, int userId, bool isActive)
    {
        return client.PutAsJsonAsync($"/api/users/{userId}/status", new ChangeUserStatusDto { IsActive = isActive });
    }

    private Task<HttpResponseMessage> SignInResponseAsync(string email)
    {
        return CreateAnonymousClient().PostAsJsonAsync("/api/auth/login", new LoginUserDto
        {
            Email = email,
            Password = Password
        });
    }

    private async Task<HttpClient> SignInAsync(string email)
    {
        var response = await CreateAnonymousClient().PostAsJsonAsync("/api/auth/token", new LoginUserDto
        {
            Email = email,
            Password = Password
        });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var auth = await response.Content.ReadFromJsonAsync<AuthResponseDto>();

        return CreateAnonymousClientWithToken(auth!.Token);
    }

    private HttpClient CreateAnonymousClientWithToken(string token)
    {
        var client = CreateAnonymousClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        return client;
    }

    private Task<HttpResponseMessage> GetMyReservationsWithAsync(string token)
    {
        return CreateAnonymousClientWithToken(token).GetAsync("/api/reservations/me");
    }

    private async Task<User> SeedUserAsync(
        string email,
        string role = UserRoles.User,
        string name = "Managed User",
        bool isActive = true)
    {
        await using var context = Fixture.CreateDbContext();
        var user = new User { Name = name, Email = email, Role = role, IsActive = isActive, IsEmailConfirmed = true };
        user.PasswordHash = new Microsoft.AspNetCore.Identity.PasswordHasher<User>().HashPassword(user, Password);
        context.Users.Add(user);
        await context.SaveChangesAsync();

        return user;
    }

    private async Task<User> ReloadAsync(int userId)
    {
        await using var context = Fixture.CreateDbContext();

        return await context.Users.AsNoTracking().SingleAsync(user => user.Id == userId);
    }

    private async Task<int> GetUserIdAsync(string email)
    {
        await using var context = Fixture.CreateDbContext();

        return (await context.Users.SingleAsync(user => user.Email == email)).Id;
    }

    private async Task<int> CountActiveAdminsAsync()
    {
        await using var context = Fixture.CreateDbContext();

        return await context.Users.CountAsync(user => user.Role == UserRoles.Admin && user.IsActive);
    }

    // Signed with the test host's key, so only the claims decide whether it is accepted.
    private static string CreateToken(int userId, string role, string? stampFingerprint, Guid sessionId)
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, userId.ToString()),
            new(ClaimTypes.Role, role),
            new(UserSessionValidator.SessionIdClaimType, sessionId.ToString())
        };

        if (stampFingerprint is not null)
        {
            claims.Add(new Claim(UserSessionValidator.SecurityStampClaimType, stampFingerprint));
        }

        var token = new JwtSecurityToken(
            issuer: ApiFactory.JwtIssuerAndAudience,
            audience: ApiFactory.JwtIssuerAndAudience,
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(10),
            signingCredentials: new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(ApiFactory.JwtKey)),
                SecurityAlgorithms.HmacSha256));

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    // Holds the user administration lock, as a slow change would, until disposed.
    private async Task<SqlTransaction> HoldUserAdministrationLockAsync()
    {
        var connection = new SqlConnection(Fixture.ConnectionString);
        await connection.OpenAsync();
        var transaction = connection.BeginTransaction();
        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText =
            $"EXEC sp_getapplock @Resource = '{ApplicationLocks.UserAdministrationLockName}', " +
            "@LockMode = 'Exclusive', @LockOwner = 'Transaction';";
        await command.ExecuteNonQueryAsync();

        return transaction;
    }

    // Until SQL Server shows this many requests waiting for an application lock.
    private async Task WaitForLockRequestsAsync(int count)
    {
        await using var connection = new SqlConnection(Fixture.ConnectionString);
        await connection.OpenAsync();

        for (var attempt = 0; attempt < 200; attempt++)
        {
            await using var command = connection.CreateCommand();
            command.CommandText =
                "SELECT COUNT(*) FROM sys.dm_tran_locks " +
                "WHERE resource_type = 'APPLICATION' AND request_status = 'WAIT'";

            if ((int)(await command.ExecuteScalarAsync())! >= count)
            {
                return;
            }

            await Task.Delay(50);
        }

        throw new TimeoutException($"Fewer than {count} requests waited for the lock.");
    }
}
