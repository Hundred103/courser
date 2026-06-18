package pl.ku1son.quizservice.service;
import pl.ku1son.quizservice.dto.*;
import pl.ku1son.quizservice.repository.QuizRepository;
import pl.ku1son.quizservice.entity.*;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import jakarta.persistence.EntityNotFoundException;
import java.util.List;



@Service
public class QuizService {
    private final QuizRepository quizRepository;

    public QuizService(QuizRepository quizRepository) {
        this.quizRepository = quizRepository;
    }

    public List<Quiz> findAllByOwnerUserId(Long ownerUserId) {
        return quizRepository.findByOwnerUserId(ownerUserId, Sort.by(Sort.Direction.ASC, "id"));
    }

    public Quiz findByIdAndOwnerUserId(Long id, Long ownerUserId) {
        return quizRepository.findByIdAndOwnerUserId(id, ownerUserId)
                .orElseThrow(() -> new EntityNotFoundException("Quiz not found"));
    }

    public Quiz findWholeQuizByIdAndOwnerUserId(Long id, Long ownerUserId) {
        return quizRepository.findWholeQuizByIdAndOwnerUserId(id, ownerUserId)
                .orElseThrow(() -> new EntityNotFoundException("Quiz not found"));
    }

    public Quiz save(Quiz quiz) {
        return quizRepository.save(quiz);
    }

    public void delete(Quiz quiz) {
        quizRepository.delete(quiz);
    }

    @Transactional
    public Quiz update(Long id, Long ownerUserId, QuizCreateDTO dto) {
        Quiz quiz = quizRepository.findByIdAndOwnerUserId(id, ownerUserId)
                .orElseThrow(() -> new EntityNotFoundException("Quiz not found"));
        quiz.setTitle(dto.title());
        quiz.getQuestions().clear();
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

    @Transactional
    public Quiz updateTitle(Long id, Long ownerUserId, QuizEditTitleDTO dto) {
        Quiz quiz = quizRepository.findByIdAndOwnerUserId(id, ownerUserId)
                .orElseThrow(() -> new EntityNotFoundException("Quiz not found"));
        quiz.setTitle(dto.title());
        return quiz;
    }
}
