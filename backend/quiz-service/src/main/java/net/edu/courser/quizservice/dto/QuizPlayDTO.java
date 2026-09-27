package net.edu.courser.quizservice.dto;
import java.util.List;



//caly quiz z pytniami i odpowiedziami
public record QuizPlayDTO(Long id, String title, List<QuestionPlayDTO> questions, QuizScoringDTO scoring) {}