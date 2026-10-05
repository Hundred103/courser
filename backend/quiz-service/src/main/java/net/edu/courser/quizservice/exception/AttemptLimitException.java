package net.edu.courser.quizservice.exception;

public class AttemptLimitException extends RuntimeException {
    public AttemptLimitException() {
        super("Wykorzystano liczbę podejść do tego quizu.");
    }
}
