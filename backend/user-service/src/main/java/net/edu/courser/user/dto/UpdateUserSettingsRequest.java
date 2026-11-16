package net.edu.courser.user.dto;

import lombok.Data;

@Data
public class UpdateUserSettingsRequest {
    private String username;
    private String accentColor;
}
