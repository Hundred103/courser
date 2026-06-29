package pl.ku1son.quizservice.dto;

import java.time.LocalDateTime;

public record QuizShareCodeDTO(String code, LocalDateTime expiresAt) {
}
