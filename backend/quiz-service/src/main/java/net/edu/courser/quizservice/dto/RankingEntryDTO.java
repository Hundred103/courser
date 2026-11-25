package net.edu.courser.quizservice.dto;
public record RankingEntryDTO(int position, String username, int scoreScaled, int maxScoreScaled, long durationMs) {}
