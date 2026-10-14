using Microsoft.EntityFrameworkCore;
using ResourceReservation.Api.Data;
using ResourceReservation.Api.DTOs;
using ResourceReservation.Api.Models;

namespace ResourceReservation.Api.Services;

// Admin management of user accounts (ADR 0010). Every change to a role or to
// active status goes through ChangeAccountAsync, which holds the user
// administration lock while it checks that an active admin remains.
public class UserService
{
    public const int MaxPageSize = 100;
    public const string OwnAccountMessage = "You can't change your own role or status.";
    public const string LastAdminMessage = "There must always be at least one active admin.";
    public const string BusyMessage = "Another account change is in progress. Try again in a moment.";
    public const string UserNotFoundMessage = "User not found.";

    private readonly AppDbContext _context;
    private readonly ApplicationLocks _locks;

    public UserService(AppDbContext context, ApplicationLocks locks)
    {
        _context = context;
        _locks = locks;
    }

    // Accounts ordered by name, optionally only those whose name or email
    // contains the search text.
    public async Task<UserAccountPageResponseDto> GetPageAsync(string? search, int page, int pageSize)
    {
        var query = _context.Users.AsNoTracking();
        var searchText = search?.Trim();

        if (!string.IsNullOrEmpty(searchText))
        {
            query = query.Where(user => user.Name.Contains(searchText) || user.Email.Contains(searchText));
        }

        var totalCount = await query.CountAsync();
        var users = await query
            .OrderBy(user => user.Name)
            .ThenBy(user => user.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(user => ToResponseDto(user))
            .ToListAsync();

        return new UserAccountPageResponseDto
        {
            Items = users,
            TotalCount = totalCount,
            Page = page,
            PageSize = pageSize
        };
    }

    public Task<ServiceResult<UserAccountResponseDto>> ChangeRoleAsync(CurrentUser admin, int userId, string role)
    {
        if (!UserRoles.IsValid(role))
        {
            return Task.FromResult<ServiceResult<UserAccountResponseDto>>(
                ServiceError.Validation("Choose User or Admin."));
        }

        return ChangeAccountAsync(admin, userId, user => user.Role = role);
    }

    // Deactivating keeps the user's reservations.
    public Task<ServiceResult<UserAccountResponseDto>> ChangeStatusAsync(CurrentUser admin, int userId, bool isActive)
    {
        return ChangeAccountAsync(admin, userId, user => user.IsActive = isActive);
    }

    private async Task<ServiceResult<UserAccountResponseDto>> ChangeAccountAsync(
        CurrentUser admin,
        int userId,
        Action<User> change)
    {
        if (admin.UserId == userId)
        {
            return ServiceError.Forbidden(OwnAccountMessage);
        }

        var adminLock = await _locks.AcquireUserAdministrationAsync();

        if (!adminLock.Acquired)
        {
            return ServiceError.Unavailable(BusyMessage);
        }

        await using var transaction = adminLock.Transaction;

        // The token was checked when the request arrived, but another admin may
        // have demoted or deactivated this one while it waited for the lock.
        if (!await IsActiveAdminAsync(admin.UserId))
        {
            return ServiceError.Forbidden();
        }

        var user = await _context.Users.FindAsync(userId);

        if (user is null)
        {
            return ServiceError.NotFound(UserNotFoundMessage);
        }

        var (oldRole, wasActive) = (user.Role, user.IsActive);
        change(user);

        if (user.Role == oldRole && user.IsActive == wasActive)
        {
            return ToResponseDto(user);
        }

        // Only removing an active admin can leave none, and the lock means no
        // other change can happen between this check and the commit.
        var removesActiveAdmin = oldRole == UserRoles.Admin && wasActive &&
            !(user.Role == UserRoles.Admin && user.IsActive);

        if (removesActiveAdmin &&
            !await _context.Users.AnyAsync(other =>
                other.Id != user.Id && other.Role == UserRoles.Admin && other.IsActive))
        {
            return ServiceError.Conflict(LastAdminMessage);
        }

        // Ends the user's existing sessions: their tokens no longer match.
        user.SecurityStamp = User.NewSecurityStamp();
        await _context.SaveChangesAsync();

        if (transaction is not null)
        {
            await transaction.CommitAsync();
        }

        return ToResponseDto(user);
    }

    private Task<bool> IsActiveAdminAsync(int userId)
    {
        return _context.Users.AnyAsync(user =>
            user.Id == userId && user.Role == UserRoles.Admin && user.IsActive);
    }

    private static UserAccountResponseDto ToResponseDto(User user)
    {
        return new UserAccountResponseDto
        {
            Id = user.Id,
            Name = user.Name,
            Email = user.Email,
            Role = user.Role,
            IsActive = user.IsActive,
            CreatedAt = user.CreatedAt
        };
    }
}
