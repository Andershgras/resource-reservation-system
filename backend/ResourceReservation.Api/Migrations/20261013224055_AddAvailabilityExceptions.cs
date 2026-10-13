using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ResourceReservation.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddAvailabilityExceptions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Only creates a new table. Existing tables and data are unchanged.
            migrationBuilder.CreateTable(
                name: "AvailabilityExceptions",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ResourceId = table.Column<int>(type: "int", nullable: false),
                    StartTime = table.Column<DateTime>(type: "datetime2", nullable: false),
                    EndTime = table.Column<DateTime>(type: "datetime2", nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedByUserId = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AvailabilityExceptions", x => x.Id);
                    table.CheckConstraint("CK_AvailabilityExceptions_EndAfterStart", "[EndTime] > [StartTime]");
                    table.ForeignKey(
                        name: "FK_AvailabilityExceptions_Resources_ResourceId",
                        column: x => x.ResourceId,
                        principalTable: "Resources",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_AvailabilityExceptions_Users_CreatedByUserId",
                        column: x => x.CreatedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AvailabilityExceptions_CreatedByUserId",
                table: "AvailabilityExceptions",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_AvailabilityExceptions_ResourceId_StartTime_EndTime",
                table: "AvailabilityExceptions",
                columns: new[] { "ResourceId", "StartTime", "EndTime" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AvailabilityExceptions");
        }
    }
}
