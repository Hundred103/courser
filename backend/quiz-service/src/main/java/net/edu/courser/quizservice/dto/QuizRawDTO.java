package net.edu.courser.quizservice.dto;

/** List row; rankingPosition = caller's top-5 place or null. */
public record QuizRawDTO(Long id, String title, long questionCount, QuizLimitsDTO limits, Integer rankingPosition) {}
