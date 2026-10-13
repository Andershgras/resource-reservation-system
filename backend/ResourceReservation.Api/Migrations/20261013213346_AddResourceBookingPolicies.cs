using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ResourceReservation.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddResourceBookingPolicies : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Only adds nullable columns. Existing resources get no overrides, so
            // they follow the default booking rules from configuration.
            migrationBuilder.AddColumn<int>(
                name: "MaxAdvanceDays",
                table: "Resources",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MaxDurationMinutes",
                table: "Resources",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MinDurationMinutes",
                table: "Resources",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MinLeadTimeMinutes",
                table: "Resources",
                type: "int",
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_Resources_BookingPolicy",
                table: "Resources",
                sql: "([MinDurationMinutes] IS NULL OR [MinDurationMinutes] > 0) AND ([MaxDurationMinutes] IS NULL OR [MaxDurationMinutes] > 0) AND ([MinLeadTimeMinutes] IS NULL OR [MinLeadTimeMinutes] >= 0) AND ([MaxAdvanceDays] IS NULL OR [MaxAdvanceDays] > 0) AND ([MinDurationMinutes] IS NULL OR [MaxDurationMinutes] IS NULL OR [MinDurationMinutes] <= [MaxDurationMinutes])");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Resources_BookingPolicy",
                table: "Resources");

            migrationBuilder.DropColumn(
                name: "MaxAdvanceDays",
                table: "Resources");

            migrationBuilder.DropColumn(
                name: "MaxDurationMinutes",
                table: "Resources");

            migrationBuilder.DropColumn(
                name: "MinDurationMinutes",
                table: "Resources");

            migrationBuilder.DropColumn(
                name: "MinLeadTimeMinutes",
                table: "Resources");
        }
    }
}
