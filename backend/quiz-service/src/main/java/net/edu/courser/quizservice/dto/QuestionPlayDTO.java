package net.edu.courser.quizservice.dto;
import java.util.List;



public record QuestionPlayDTO(Long id, String content, List<AnswerPlayDTO> answers, String image) {}