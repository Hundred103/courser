package net.edu.courser.quizservice.dto;
public record QuizArchiveImportDTO(QuizCreateDTO quiz, String rankingVersionId, Boolean migratingGuestQuiz) {}
