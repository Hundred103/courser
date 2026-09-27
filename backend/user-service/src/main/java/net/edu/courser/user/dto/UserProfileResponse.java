package net.edu.courser.user.dto;

import net.edu.courser.user.entity.UserRole;

import java.time.LocalDateTime;

public record UserProfileResponse(
        Long id,
        String email,
        String username,
        UserRole role,
        Integer totalScore,
        Integer quizzesCompleted,
        LocalDateTime createdAt,
        LocalDateTime lastLogin
) {
}
