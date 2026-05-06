package pl.ku1son.quizservice.service;
import pl.ku1son.quizservice.dto.*;
import pl.ku1son.quizservice.repository.QuizRepository;
import pl.ku1son.quizservice.entity.*;
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

    public List<Quiz> findAll() {
        return quizRepository.findAll();
    }

    public Quiz findById(Long id) {  //sam quiz bez pytan i odpowiedzi
        return quizRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Quiz not found"));
    }

    public Quiz findWholeQuizById(Long id) {  //caly quiz z pytaniami i odpowiedziami
        return quizRepository.findWholeQuizById(id)
                .orElseThrow(() -> new EntityNotFoundException("Quiz not found"));
    }

    public Quiz save(Quiz quiz) {
        return quizRepository.save(quiz);
    }

    public void delete(Quiz quiz) {
        quizRepository.delete(quiz);
    }

    @Transactional
    public Quiz update(Long id, QuizCreateDTO dto) {
        Quiz quiz = quizRepository.findById(id)
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
    public Quiz updateTitle(Long id, QuizEditTitleDTO dto) {
        Quiz quiz = quizRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Quiz not found"));
        quiz.setTitle(dto.title());
        return quiz;
    }
}
