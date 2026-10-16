package net.edu.courser.quizservice.service;

public final class QuizLimitsRules {
    public static final int MAX_ATTEMPTS = 1_000;
    public static final int MAX_QUIZ_TIME_SECONDS = 43_200;
    public static final int MAX_QUESTION_TIME_SECONDS = 3_600;

    private QuizLimitsRules() {}

    public static void validate(
            Integer maxAttempts,
            Integer quizTimeSeconds,
            Integer questionTimeSeconds,
            int questionCount
    ) {
        validateLimit(maxAttempts, "Liczba podejść", MAX_ATTEMPTS);
        validateLimit(quizTimeSeconds, "Czas quizu", MAX_QUIZ_TIME_SECONDS);
        validateLimit(questionTimeSeconds, "Czas pytania", MAX_QUESTION_TIME_SECONDS);

        if (quizTimeSeconds != null && questionTimeSeconds != null
                && (long) questionTimeSeconds * questionCount < quizTimeSeconds) {
            throw new IllegalArgumentException(
                    "Czas pytania pomnożony przez liczbę pytań musi być nie mniejszy niż czas całego quizu."
            );
        }
    }

    private static void validateLimit(Integer value, String label, int maximum) {
        if (value != null && (value <= 0 || value > maximum)) {
            throw new IllegalArgumentException(label + " musi mieścić się w zakresie 1–" + maximum + ".");
        }
    }
}
