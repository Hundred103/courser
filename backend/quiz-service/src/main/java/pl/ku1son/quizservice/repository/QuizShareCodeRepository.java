package pl.ku1son.quizservice.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import pl.ku1son.quizservice.entity.QuizShareCode;

import java.util.Optional;

@Repository
public interface QuizShareCodeRepository extends JpaRepository<QuizShareCode, Long> {
    boolean existsByCode(String code);

    Optional<QuizShareCode> findByCodeAndActiveTrue(String code);
}
