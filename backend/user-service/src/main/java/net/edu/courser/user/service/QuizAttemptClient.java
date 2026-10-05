package net.edu.courser.user.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

@Component
public class QuizAttemptClient {
    private final RestClient restClient;

    public QuizAttemptClient(@Value("${app.quiz-service-url:http://localhost:8081}") String quizServiceUrl) {
        this.restClient = RestClient.builder().baseUrl(quizServiceUrl).build();
    }

    public QuizLimitsView limits(Long quizId) {
        try {
            QuizLimitsView limits = restClient.get()
                    .uri("/internal/quizzes/{quizId}/limits", quizId)
                    .retrieve()
                    .body(QuizLimitsView.class);
            return limits == null ? QuizLimitsView.unlimited() : limits;
        } catch (RestClientResponseException exception) {
            throw new RuntimeException("Nie udało się sprawdzić limitów quizu.");
        }
    }

    public AttemptVerdictView verdict(Long attemptId, Long userId) {
        try {
            AttemptVerdictView verdict = restClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/internal/attempts/{attemptId}")
                            .queryParam("userId", userId)
                            .build(attemptId))
                    .retrieve()
                    .body(AttemptVerdictView.class);
            if (verdict == null) {
                throw new RuntimeException("Nie udało się sprawdzić czasu quizu.");
            }
            return verdict;
        } catch (RestClientResponseException exception) {
            if (exception.getStatusCode().value() == 409 || containsCheating(exception.getResponseBodyAsString())) {
                throw new RuntimeException(QuizCheating.MESSAGE);
            }
            throw new RuntimeException("Nie udało się sprawdzić czasu quizu.");
        }
    }

    private boolean containsCheating(String body) {
        return body != null && body.contains("Oszustwo");
    }

    public record QuizLimitsView(Integer maxAttempts, Integer quizTimeSeconds, Integer questionTimeSeconds) {
        public static QuizLimitsView unlimited() {
            return new QuizLimitsView(null, null, null);
        }

        public boolean isActive() {
            return maxAttempts != null || quizTimeSeconds != null || questionTimeSeconds != null;
        }
    }

    public record AttemptVerdictView(String status, Long quizId, Long userId) {}

    public static final class QuizCheating {
        public static final String MESSAGE = "Oszustwo: rozwiązanie wysłane po zakończeniu czasu quizu.";

        private QuizCheating() {}
    }
}
