package pl.ku1son.quizservice.dto;
import java.util.List;



public record QuestionCreateDTO(String content, List<AnswerCreateDTO> answers) {}
