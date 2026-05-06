package pl.ku1son.quizservice.dto;
import java.util.List;



public record QuizCreateDTO(String title, List<QuestionCreateDTO> questions) {}
