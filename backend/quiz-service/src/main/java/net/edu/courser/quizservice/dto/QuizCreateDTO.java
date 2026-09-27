package net.edu.courser.quizservice.dto;
import java.util.List;



public record QuizCreateDTO(String title, List<QuestionCreateDTO> questions, QuizScoringDTO scoring) {}
