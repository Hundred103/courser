package net.edu.courser.quizservice.dto;

public record QuizLimitsDTO(
        Integer maxAttempts,
        Integer quizTimeSeconds,
        Integer questionTimeSeconds,
        Boolean randomQuestionOrder,
        Boolean showCorrectAnswers
) {
    public boolean isActive() {
        return maxAttempts != null || quizTimeSeconds != null || questionTimeSeconds != null;
    }
}
