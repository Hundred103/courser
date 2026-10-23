package net.edu.courser.quizservice.repository;
import net.edu.courser.quizservice.entity.QuizRankingVersion;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
public interface QuizRankingVersionRepository extends JpaRepository<QuizRankingVersion, UUID> {}
