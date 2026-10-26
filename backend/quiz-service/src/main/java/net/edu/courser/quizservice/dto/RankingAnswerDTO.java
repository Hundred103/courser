package net.edu.courser.quizservice.dto;
import java.util.List;
public record RankingAnswerDTO(int questionIndex, List<Integer> answerIndexes) {}
