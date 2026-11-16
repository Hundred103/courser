package net.edu.courser.user.dto;

import java.util.UUID;

public record CompleteStatisticsRequest(UUID requestId, Long quizId, Integer checkedQuestions,
        boolean studyMode, Integer score, Integer maxScore, Integer effectivenessHundredths,
        String timeZone) { }
