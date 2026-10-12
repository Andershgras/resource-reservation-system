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
    public DbSet<Reservation> Reservations { get; set; }
    public DbSet<User> Users { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(user =>
        {
            user.Property(u => u.Name).HasMaxLength(100);
            user.Property(u => u.Email).HasMaxLength(255);
            user.Property(u => u.Role).HasMaxLength(20);
            user.HasIndex(u => u.Email).IsUnique();
        });

        modelBuilder.Entity<Resource>(resource =>
        {
            resource.Property(r => r.Name).HasMaxLength(100);
            resource.Property(r => r.Description).HasMaxLength(500);
            resource.Property(r => r.Location).HasMaxLength(200);
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
        });
    }
}
