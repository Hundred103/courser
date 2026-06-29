package pl.ku1son.quizservice.dto;
import pl.ku1son.quizservice.entity.Answer;
import pl.ku1son.quizservice.entity.*;
import pl.ku1son.quizservice.service.ImageCompressor;
import org.springframework.stereotype.Component;

import java.util.List;



@Component
public class MapperDTO {
    private final ImageCompressor imageCompressor;

    public MapperDTO(ImageCompressor imageCompressor) {
        this.imageCompressor = imageCompressor;
    }

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
                        .toList(),
                imageCompressor.toBase64(question.getImageData())
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
        List<QuestionCreateDTO> questions = dto.questions();
        for (int index = 0; index < questions.size(); index++) {
            quiz.addQuestion(toQuestionEntity(questions.get(index), index));
        }
        return quiz;
    }

    public Question toQuestionEntity(QuestionCreateDTO qDto, int index) {
        Question question = Question.builder()
                .content(qDto.content())
                .build();
        applyImage(question, qDto.image(), index);
        qDto.answers().forEach(aDto -> {
            Answer answer = Answer.builder()
                    .content(aDto.content())
                    .correct(aDto.correct())
                    .build();
            question.addAnswer(answer);
        });
        return question;
    }

    public void applyImage(Question question, String imageBase64, int index) {
        if (imageBase64 == null || imageBase64.isBlank()) {
            question.setImageFilename(null);
            question.setImageData(null);
            return;
        }

        byte[] compressed = imageCompressor.compressFromBase64(imageBase64);
        question.setImageFilename("image" + (index + 1) + ".jpg");
        question.setImageData(compressed);
    }
}
