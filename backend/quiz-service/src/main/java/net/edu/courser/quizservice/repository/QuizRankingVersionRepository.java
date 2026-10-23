package net.edu.courser.quizservice.repository;
import net.edu.courser.quizservice.entity.QuizRankingVersion;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
import java.time.LocalDateTime;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface QuizRankingVersionRepository extends JpaRepository<QuizRankingVersion, UUID> {
    @Modifying
    @Query(value = """
            delete from quiz_ranking_versions version
            where version.created_at < :orphanedBefore
              and not exists (select 1 from quizzes quiz where quiz.ranking_version_id = version.id)
              and not exists (
                  select 1 from quiz_share_codes code
                  where code.ranking_version_id = version.id
                    and code.active = true
                    and (code.expires_at is null or code.expires_at > :now)
              )
            """, nativeQuery = true)
    int deleteOrphanedBefore(
            @Param("orphanedBefore") LocalDateTime orphanedBefore,
            @Param("now") LocalDateTime now
    );
}
