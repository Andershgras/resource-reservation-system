using System.ComponentModel.DataAnnotations;

namespace ResourceReservation.Api.DTOs;

public class ChangeUserStatusDto
{
    // Required, so a request that leaves it out can't deactivate anyone by
    // default (audit L6).
    [Required(ErrorMessage = "Choose whether the account is active.")]
    public bool? IsActive { get; set; }
}
