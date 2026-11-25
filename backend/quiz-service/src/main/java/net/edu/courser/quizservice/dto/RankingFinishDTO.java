package net.edu.courser.quizservice.dto;
import java.util.List;
public record RankingFinishDTO(int scoreScaled, int maxScoreScaled, long durationMs, Integer position, boolean outsideTopFive, List<RankingEntryDTO> leaderboard) {}
