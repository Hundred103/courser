package net.edu.courser.quizservice.dto;
import java.util.List;



public record QuizPlayDTO(Long id, String title, List<QuestionPlayDTO> questions, QuizScoringDTO scoring, QuizLimitsDTO limits, boolean rankingEnabled, boolean rankingProtected) {}
