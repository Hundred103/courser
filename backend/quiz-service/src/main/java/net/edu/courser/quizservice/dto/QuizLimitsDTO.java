package net.edu.courser.quizservice.dto;

public record QuizLimitsDTO(
        Boolean randomQuestionOrder,
        Boolean showCorrectAnswers
) {}
