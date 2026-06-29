package pl.ku1son.quizservice.repository;
import pl.ku1son.quizservice.entity.Quiz;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import org.springframework.data.jpa.repository.EntityGraph;
import java.util.List;
import java.util.Optional;



@Repository
public interface QuizRepository extends JpaRepository<Quiz, Long> {
    List<Quiz> findByOwnerUserId(Long ownerUserId, org.springframework.data.domain.Sort sort);

    Optional<Quiz> findByIdAndOwnerUserId(Long id, Long ownerUserId);

    @EntityGraph(attributePaths = {
            "questions"
    })
    Optional<Quiz> findWholeQuizByIdAndOwnerUserId(Long id, Long ownerUserId);
}
