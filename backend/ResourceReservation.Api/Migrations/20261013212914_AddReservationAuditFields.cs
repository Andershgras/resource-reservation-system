using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ResourceReservation.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddReservationAuditFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Only adds columns. Existing reservations are kept, and their audit
            // timestamps stay null because the real times were never recorded.
            // SQL Server fills in Version for existing rows itself.
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "CancelledAt",
                table: "Reservations",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "CancelledByUserId",
                table: "Reservations",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "CreatedAt",
                table: "Reservations",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "UpdatedAt",
                table: "Reservations",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<byte[]>(
                name: "Version",
                table: "Reservations",
                type: "rowversion",
                rowVersion: true,
                nullable: false,
                defaultValue: new byte[0]);

            migrationBuilder.CreateIndex(
                name: "IX_Reservations_CancelledByUserId",
                table: "Reservations",
                column: "CancelledByUserId");

            migrationBuilder.AddForeignKey(
                name: "FK_Reservations_Users_CancelledByUserId",
                table: "Reservations",
                column: "CancelledByUserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Reservations_Users_CancelledByUserId",
                table: "Reservations");

            migrationBuilder.DropIndex(
                name: "IX_Reservations_CancelledByUserId",
                table: "Reservations");

            migrationBuilder.DropColumn(
                name: "CancelledAt",
                table: "Reservations");

            migrationBuilder.DropColumn(
                name: "CancelledByUserId",
                table: "Reservations");

            migrationBuilder.DropColumn(
                name: "CreatedAt",
                table: "Reservations");

            migrationBuilder.DropColumn(
                name: "UpdatedAt",
                table: "Reservations");

            migrationBuilder.DropColumn(
                name: "Version",
                table: "Reservations");
        }
    }
}
