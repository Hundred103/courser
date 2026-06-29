package pl.ku1son.quizservice.dto;
import pl.ku1son.quizservice.entity.Answer;
import pl.ku1son.quizservice.entity.*;
import org.springframework.stereotype.Component;



@Component
public class MapperDTO {
    public QuizRawDTO toQuizRawDTO (Quiz quiz) {
        return new QuizRawDTO(quiz.getId(), quiz.getTitle());
    }

    //ENTITY --> DTO (wysylamy do uzytkownika)
    public QuizPlayDTO toQuizPlayDTO(Quiz quiz) {
        return new QuizPlayDTO(
                quiz.getId(),
                quiz.getTitle(),
                quiz.getQuestions()
                        .stream()
                        .map(this::toQuestionPlayDTO)
                        .toList()
        );
    }
    private QuestionPlayDTO toQuestionPlayDTO(Question question) {
        return new QuestionPlayDTO(
                question.getId(),
                question.getContent(),
                question.getAnswers()
                        .stream()
                        .map(this::toAnswerPlayDTO)
                        .toList()
        );
    }
    private AnswerPlayDTO toAnswerPlayDTO(Answer answer) {
        return new AnswerPlayDTO(
                answer.getId(),
                answer.getContent(),
                answer.isCorrect()
        );
    }

    //DTO --> ENTITY (dostajemy od uzytkownika)
    public Quiz toQuizEntity(QuizCreateDTO dto) {
        Quiz quiz = Quiz.builder()
                .title(dto.title())
                .build();
        dto.questions().forEach(qDto -> {
            Question question = Question.builder()
                    .content(qDto.content())
                    .build();
            qDto.answers().forEach(aDto -> {
                Answer answer = Answer.builder()
                        .content(aDto.content())
                        .correct(aDto.correct())
                        .build();
                question.addAnswer(answer);
            });
            quiz.addQuestion(question);
        });
        return quiz;
    }
}
