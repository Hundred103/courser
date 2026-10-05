package net.edu.courser.quizservice.dto;

import java.util.List;

// QUIZ_ANSWERS_IN: body of the player's submitted answer ids
public record SubmitAnswersRequest(List<Long> answerIds) {}
