using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ResourceReservation.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddUserAccountSecurity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "CreatedAt",
                table: "Users",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "FailedLoginCount",
                table: "Users",
                type: "int",
                nullable: false,
                defaultValue: 0);

            // Existing accounts stay active. The model has no default, so EF always
            // sends the value for new users and an inactive user is never saved as active.
            migrationBuilder.AddColumn<bool>(
                name: "IsActive",
                table: "Users",
                type: "bit",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "LockoutEndsAt",
                table: "Users",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SecurityStamp",
                table: "Users",
                type: "varchar(64)",
                unicode: false,
                maxLength: 64,
                nullable: false,
                defaultValueSql: "CONVERT(varchar(64), CRYPT_GEN_RANDOM(32), 2)");

            // Give every existing account its own stamp explicitly, rather than
            // relying on how SQL Server applies a new column's default to old rows.
            migrationBuilder.Sql(
                "UPDATE [Users] SET [SecurityStamp] = CONVERT(varchar(64), CRYPT_GEN_RANDOM(32), 2);");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CreatedAt",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "FailedLoginCount",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "IsActive",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "LockoutEndsAt",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "SecurityStamp",
                table: "Users");
        }
    }
}
