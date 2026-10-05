package net.edu.courser.quizservice.dto;

public record QuizStartInfoDTO(
        Long id,
        String title,
        int questionCount,
        Integer quizTimeSeconds,
        Integer questionTimeSeconds,
        Integer maxAttempts,
        int usedAttempts
) {}
