package net.edu.courser.quizservice.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import net.edu.courser.quizservice.entity.QuizShareCode;

import java.util.Optional;
import java.time.LocalDateTime;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

@Repository
public interface QuizShareCodeRepository extends JpaRepository<QuizShareCode, Long> {
    boolean existsByCode(String code);

    Optional<QuizShareCode> findByCodeAndActiveTrue(String code);

    @Modifying
    @Query("delete from QuizShareCode code where code.expiresAt is not null and code.expiresAt < :threshold")
    int deleteExpiredBefore(@Param("threshold") LocalDateTime threshold);
}
