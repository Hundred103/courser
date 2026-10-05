package net.edu.courser.quizservice.service;

public final class QuizLimitsRules {
    private QuizLimitsRules() {}

    public static void validate(Integer quizTimeSeconds, Integer questionTimeSeconds, int questionCount) {
        if (quizTimeSeconds != null && questionTimeSeconds != null
                && (long) questionTimeSeconds * questionCount < quizTimeSeconds) {
            throw new IllegalArgumentException(
                    "Czas pytania pomnożony przez liczbę pytań musi być nie mniejszy niż czas całego quizu."
            );
        }
    }
}
