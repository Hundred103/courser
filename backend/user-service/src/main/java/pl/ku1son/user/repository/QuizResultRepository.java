package pl.ku1son.user.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import pl.ku1son.user.entity.QuizResult;

import java.util.List;

@Repository
public interface QuizResultRepository extends JpaRepository<QuizResult, Long> {
    List<QuizResult> findByUserId(Long userId);

    List<QuizResult> findByUserIdAndQuizId(Long userId, Long quizId);
}
