package net.edu.courser.quizservice.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import net.edu.courser.quizservice.entity.QuizShareCode;

import java.util.Optional;

@Repository
public interface QuizShareCodeRepository extends JpaRepository<QuizShareCode, Long> {
    boolean existsByCode(String code);

    Optional<QuizShareCode> findByCodeAndActiveTrue(String code);
}
