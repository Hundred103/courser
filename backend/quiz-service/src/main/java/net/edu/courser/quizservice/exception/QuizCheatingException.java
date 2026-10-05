package net.edu.courser.quizservice.exception;

public class QuizCheatingException extends RuntimeException {
    public static final String MESSAGE = "Oszustwo: rozwiązanie wysłane po zakończeniu czasu quizu.";

    public QuizCheatingException() {
        super(MESSAGE);
    }
}
