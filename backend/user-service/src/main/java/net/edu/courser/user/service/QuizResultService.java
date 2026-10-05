package net.edu.courser.user.service;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import net.edu.courser.user.dto.BestQuizScoreResponse;
import net.edu.courser.user.dto.SaveQuizResultRequest;
import net.edu.courser.user.entity.QuizResult;
import net.edu.courser.user.repository.QuizResultRepository;
import net.edu.courser.user.repository.UserRepository;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class QuizResultService {

    private final QuizResultRepository quizResultRepository;
    private final UserRepository userRepository;
    private final QuizAttemptClient quizAttemptClient;

    @Transactional
    public QuizResult saveResult(Long userId, SaveQuizResultRequest request) {
        if (!userRepository.existsById(userId)) {
            throw new RuntimeException("Użytkownik nie istnieje");
        }

        if (request.getQuizId() == null || request.getQuizId() <= 0) {
            throw new RuntimeException("Nieprawidłowy identyfikator quizu");
        }

        if (request.getScore() == null || request.getMaxScore() == null) {
            throw new RuntimeException("Wynik jest wymagany");
        }

        if (request.getMaxScore() < 0) {
            throw new RuntimeException("Maksymalny wynik nie może być ujemny");
        }

        if (request.getScore() > request.getMaxScore()) {
            throw new RuntimeException("Wynik nie może być wyższy od maksimum");
        }

        verifyAttempt(userId, request);

        QuizResult result = QuizResult.builder()
                .userId(userId)
                .quizId(request.getQuizId())
                .score(request.getScore())
                .maxScore(request.getMaxScore())
                .build();

        return quizResultRepository.save(result);
    }

    public List<BestQuizScoreResponse> getBestScoresByUser(Long userId) {
        if (!userRepository.existsById(userId)) {
            throw new RuntimeException("Użytkownik nie istnieje");
        }

        Map<Long, QuizResult> bestByQuizId = new HashMap<>();

        for (QuizResult result : quizResultRepository.findByUserId(userId)) {
            QuizResult currentBest = bestByQuizId.get(result.getQuizId());

            if (currentBest == null || scoreRatio(result) > scoreRatio(currentBest)) {
                bestByQuizId.put(result.getQuizId(), result);
            } else if (scoreRatio(result) == scoreRatio(currentBest)
                    && result.getCompletedAt().isAfter(currentBest.getCompletedAt())) {
                bestByQuizId.put(result.getQuizId(), result);
            }
        }

        List<BestQuizScoreResponse> response = new ArrayList<>();

        for (QuizResult result : bestByQuizId.values()) {
            response.add(BestQuizScoreResponse.builder()
                    .quizId(result.getQuizId())
                    .score(result.getScore())
                    .maxScore(result.getMaxScore())
                    .build());
        }

        return response;
    }

    private void verifyAttempt(Long userId, SaveQuizResultRequest request) {
        QuizAttemptClient.QuizLimitsView limits = quizAttemptClient.limits(request.getQuizId());
        if (!limits.isActive()) {
            return;
        }

        if (request.getAttemptId() == null) {
            throw new RuntimeException(QuizAttemptClient.QuizCheating.MESSAGE);
        }

        QuizAttemptClient.AttemptVerdictView verdict = quizAttemptClient.verdict(request.getAttemptId(), userId);
        if (!request.getQuizId().equals(verdict.quizId()) || !userId.equals(verdict.userId())) {
            throw new RuntimeException(QuizAttemptClient.QuizCheating.MESSAGE);
        }

        if ("CHEATING".equals(verdict.status())) {
            throw new RuntimeException(QuizAttemptClient.QuizCheating.MESSAGE);
        }

        if (!"COMPLETED".equals(verdict.status())) {
            throw new RuntimeException("Wynik odrzucony: quiz nie został zakończony w czasie.");
        }
    }

    private double scoreRatio(QuizResult result) {
        if (result.getMaxScore() == 0) {
            return result.getScore();
        }

        return (double) result.getScore() / result.getMaxScore();
    }
}
