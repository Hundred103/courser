package net.edu.courser.quizservice.dto;

public record QuizScoringDTO(
        String mode,
        Boolean allowNegativeScore,
        Double pointsPerCorrect,
        Double incorrectPenalty,
        String penaltyMode
) {}
