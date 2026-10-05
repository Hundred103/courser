package net.edu.courser.quizservice.repository;

import net.edu.courser.quizservice.entity.AttemptStatus;
import net.edu.courser.quizservice.entity.QuizAttempt;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface QuizAttemptRepository extends JpaRepository<QuizAttempt, Long> {
    Optional<QuizAttempt> findFirstByQuizIdAndUserIdAndStatusOrderByIdDesc(Long quizId, Long userId, AttemptStatus status);

    List<QuizAttempt> findByOriginQuizIdAndUserIdAndStatus(Long originQuizId, Long userId, AttemptStatus status);

    long countByOriginQuizIdAndUserIdAndStatusIn(Long originQuizId, Long userId, Collection<AttemptStatus> statuses);
}
