package net.edu.courser.user.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import net.edu.courser.user.entity.CompletedQuizAttempt;

@Repository
public interface CompletedQuizAttemptRepository extends JpaRepository<CompletedQuizAttempt, Long> {
    long countByUserIdAndQuizId(Long userId, Long quizId);
}
