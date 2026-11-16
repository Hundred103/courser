package net.edu.courser.quizservice.repository;
import net.edu.courser.quizservice.entity.QuizRankingAttempt;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;
public interface QuizRankingAttemptRepository extends JpaRepository<QuizRankingAttempt, UUID> {
    Optional<QuizRankingAttempt> findByRankingVersionIdAndUserIdAndClientSessionIdAndStatus(
            UUID rankingVersionId,
            Long userId,
            UUID clientSessionId,
            String status
    );
}
