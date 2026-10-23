package net.edu.courser.quizservice.repository;
import net.edu.courser.quizservice.entity.*;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface QuizRankingEntryRepository extends JpaRepository<QuizRankingEntry, Long> {
 List<QuizRankingEntry> findByRankingVersion(QuizRankingVersion version);
 Optional<QuizRankingEntry> findByRankingVersionAndUserId(QuizRankingVersion version, Long userId);
}
