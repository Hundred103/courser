package pl.ku1son.user.service;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.ku1son.user.dto.BestQuizScoreResponse;
import pl.ku1son.user.dto.SaveQuizResultRequest;
import pl.ku1son.user.entity.QuizResult;
import pl.ku1son.user.repository.QuizResultRepository;
import pl.ku1son.user.repository.UserRepository;

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

        if (request.getMaxScore() <= 0) {
            throw new RuntimeException("Maksymalny wynik musi być większy od zera");
        }

        if (request.getScore() < 0 || request.getScore() > request.getMaxScore()) {
            throw new RuntimeException("Wynik musi mieścić się w zakresie od 0 do maksimum");
        }

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

    private double scoreRatio(QuizResult result) {
        return (double) result.getScore() / result.getMaxScore();
    }
}
