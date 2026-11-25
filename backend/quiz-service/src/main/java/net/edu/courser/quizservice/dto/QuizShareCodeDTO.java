package net.edu.courser.quizservice.dto;

import java.time.LocalDateTime;

public record QuizShareCodeDTO(String code, LocalDateTime expiresAt) {
}
