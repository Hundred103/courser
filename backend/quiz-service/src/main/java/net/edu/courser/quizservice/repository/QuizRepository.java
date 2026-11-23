package net.edu.courser.quizservice.repository;
import net.edu.courser.quizservice.entity.Quiz;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import org.springframework.data.jpa.repository.EntityGraph;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface QuizRepository extends JpaRepository<Quiz, Long> {
    List<Quiz> findByOwnerUserIdOrderByIdAsc(Long ownerUserId);

    Optional<Quiz> findByIdAndOwnerUserId(Long id, Long ownerUserId);

    /** Oldest copy when owner has multiple quizzes on one version. */
    Optional<Quiz> findFirstByOwnerUserIdAndRankingVersion_IdOrderByIdAsc(Long ownerUserId, UUID rankingVersionId);

    boolean existsByRankingVersion_IdAndOwnerUserIdNot(UUID rankingVersionId, Long ownerUserId);

    @EntityGraph(attributePaths = {
            "questions"
    })
    Optional<Quiz> findWholeQuizByIdAndOwnerUserId(Long id, Long ownerUserId);
}
