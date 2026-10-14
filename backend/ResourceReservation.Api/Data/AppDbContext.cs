using Microsoft.EntityFrameworkCore;
using ResourceReservation.Api.Models;

namespace ResourceReservation.Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options)
        : base(options)
    {
    }

    public DbSet<Resource> Resources { get; set; }
    public DbSet<Availability> Availabilities { get; set; }
    public DbSet<AvailabilityRule> AvailabilityRules { get; set; }
    public DbSet<AvailabilityException> AvailabilityExceptions { get; set; }
    public DbSet<Reservation> Reservations { get; set; }
    public DbSet<User> Users { get; set; }
    public DbSet<UserToken> UserTokens { get; set; }
    public DbSet<AccountEmailCooldown> AccountEmailCooldowns { get; set; }
    public DbSet<BookingNotification> BookingNotifications { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(user =>
        {
            user.Property(u => u.Name).HasMaxLength(100);
            user.Property(u => u.Email).HasMaxLength(255);
            user.Property(u => u.Role).HasMaxLength(20);
            // The database default covers rows inserted outside the app, so no
            // account is ever left without a stamp of its own.
            user.Property(u => u.SecurityStamp)
                .HasMaxLength(User.SecurityStampLength)
                .IsUnicode(false)
                .HasDefaultValueSql($"CONVERT(varchar({User.SecurityStampLength}), CRYPT_GEN_RANDOM(32), 2)");
            user.HasIndex(u => u.Email).IsUnique();
        });

        modelBuilder.Entity<UserToken>(token =>
        {
            token.Property(t => t.Purpose).HasMaxLength(30);
            token.Property(t => t.TokenHash).HasMaxLength(UserToken.TokenHashLength).IsUnicode(false);
            // Tokens are looked up by hash only.
            token.HasIndex(t => t.TokenHash).IsUnique();
            token.HasIndex(t => new { t.UserId, t.Purpose });
            token.HasOne(t => t.User)
                .WithMany()
                .HasForeignKey(t => t.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AccountEmailCooldown>(cooldown =>
        {
            cooldown.HasKey(c => new { c.UserId, c.Purpose });
            cooldown.Property(c => c.Purpose).HasMaxLength(30);
            cooldown.HasOne<User>()
                .WithMany()
                .HasForeignKey(c => c.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<BookingNotification>(notification =>
        {
            notification.Property(n => n.Kind).HasMaxLength(20);
            notification.Property(n => n.ResourceName).HasMaxLength(100);
            notification.Property(n => n.ResourceLocation).HasMaxLength(200);
            notification.Property(n => n.RecipientName).HasMaxLength(100);
            notification.Property(n => n.RecipientEmail).HasMaxLength(255);
            notification.Property(n => n.LastError).HasMaxLength(BookingNotification.LastErrorMaxLength);
            // The worker looks for emails still waiting, in order.
            notification.HasIndex(n => new { n.NextAttemptAt, n.Id })
                .HasFilter("[SentAt] IS NULL AND [FailedAt] IS NULL");
            notification.HasOne(n => n.Reservation)
                .WithMany()
                .HasForeignKey(n => n.ReservationId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Resource>(resource =>
        {
            resource.Property(r => r.Name).HasMaxLength(100);
            resource.Property(r => r.Description).HasMaxLength(500);
            resource.Property(r => r.Location).HasMaxLength(200);

            // Booking rule overrides are optional, but must make sense when set.
            resource.ToTable(table => table.HasCheckConstraint(
                "CK_Resources_BookingPolicy",
                "([MinDurationMinutes] IS NULL OR [MinDurationMinutes] > 0) AND " +
                "([MaxDurationMinutes] IS NULL OR [MaxDurationMinutes] > 0) AND " +
                "([MinLeadTimeMinutes] IS NULL OR [MinLeadTimeMinutes] >= 0) AND " +
                "([MaxAdvanceDays] IS NULL OR [MaxAdvanceDays] > 0) AND " +
                "([MinDurationMinutes] IS NULL OR [MaxDurationMinutes] IS NULL OR " +
                "[MinDurationMinutes] <= [MaxDurationMinutes])"));
        });

        modelBuilder.Entity<AvailabilityException>(closure =>
        {
            closure.Property(c => c.Reason).HasMaxLength(200);
            closure.ToTable(table => table.HasCheckConstraint(
                "CK_AvailabilityExceptions_EndAfterStart",
                "[EndTime] > [StartTime]"));

            // Supports loading a resource's closures for a date range.
            closure.HasIndex(c => new { c.ResourceId, c.StartTime, c.EndTime });

            // A closure means nothing without its resource, like availability windows.
            closure.HasOne(c => c.Resource)
                .WithMany()
                .HasForeignKey(c => c.ResourceId)
                .OnDelete(DeleteBehavior.Cascade);
            closure.HasOne(c => c.CreatedBy)
                .WithMany()
                .HasForeignKey(c => c.CreatedByUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Reservation>(reservation =>
        {
            reservation.Property(r => r.Status).HasMaxLength(20);
            reservation.ToTable(table => table.HasCheckConstraint(
                "CK_Reservations_Status",
                $"[Status] IN ('{ReservationStatuses.Active}', '{ReservationStatuses.Cancelled}')"));

            // Supports the overlap check run for every new reservation.
            reservation.HasIndex(r => new { r.ResourceId, r.Status, r.StartTime, r.EndTime });

            // Reservation history must never disappear as a side effect of a delete.
            reservation.HasOne(r => r.Resource)
                .WithMany()
                .HasForeignKey(r => r.ResourceId)
                .OnDelete(DeleteBehavior.Restrict);
            reservation.HasOne(r => r.User)
                .WithMany(u => u.Reservations)
                .HasForeignKey(r => r.UserId)
                .OnDelete(DeleteBehavior.Restrict);
            reservation.HasOne(r => r.CancelledBy)
                .WithMany()
                .HasForeignKey(r => r.CancelledByUserId)
                .OnDelete(DeleteBehavior.Restrict);

            reservation.Property(r => r.Version).IsRowVersion();
        });
    }
}
