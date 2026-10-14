using System.ComponentModel.DataAnnotations;
using ResourceReservation.Api.Models;

namespace ResourceReservation.Api.DTOs;

public class ChangeUserRoleDto
{
    [Required(ErrorMessage = "Choose a role.")]
    [AllowedValues(UserRoles.User, UserRoles.Admin, ErrorMessage = "Choose User or Admin.")]
    public string? Role { get; set; }
}
