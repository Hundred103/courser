package net.edu.courser.quizservice.exception;

public class RankingCopyRequiredException extends RuntimeException {
    public RankingCopyRequiredException() {
        super("Ten quiz został już udostępniony. Zmiany treści zapisz jako kopię.");
    }
}
