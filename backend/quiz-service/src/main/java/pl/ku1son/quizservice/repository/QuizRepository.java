package pl.ku1son.quizservice.repository;
import pl.ku1son.quizservice.entity.Quiz;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import org.springframework.data.jpa.repository.EntityGraph;
import java.util.Optional;



@Repository
public interface QuizRepository extends JpaRepository<Quiz, Long> {
    @EntityGraph(attributePaths = {
            "questions",
            "questions.answers"
    })
    Optional<Quiz> findWholeQuizById(Long id);
}
