package pl.ku1son.quizservice.dto;
import java.util.List;



//pytania wraz z odpowiedziami
public record QuestionPlayDTO(Long id, String content, List<AnswerPlayDTO> answers) {}