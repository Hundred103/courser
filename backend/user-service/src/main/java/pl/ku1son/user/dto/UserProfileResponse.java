package pl.ku1son.user.dto;

import pl.ku1son.user.entity.UserRole;

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
