package net.edu.courser.quizservice.dto;
import java.util.List;



public record QuestionCreateDTO(String content, List<AnswerCreateDTO> answers, String image) {}
