package net.edu.courser.quizservice.dto;

public record AttemptStateResponse(
        Long attemptId,
        Integer maxAttempts,
        int usedAttempts,
        Long quizRemainingMillis,
        Long questionRemainingMillis,
        boolean quizEndingSoon,
        boolean questionEndingSoon,
        boolean quizExpired,
        boolean questionExpired,
        int endingWarningSeconds
) {}
