package net.edu.courser.quizservice.dto;

import java.util.List;

public record RankingLeaderboardDTO(Integer position, List<RankingEntryDTO> leaderboard) {}
