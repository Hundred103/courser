package net.edu.courser.quizservice.service;

import net.edu.courser.quizservice.repository.QuizRankingVersionRepository;
import net.edu.courser.quizservice.repository.QuizShareCodeRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

@Service
public class RankingDataCleanupService {
    private final QuizShareCodeRepository shareCodeRepository;
    private final QuizRankingVersionRepository rankingVersionRepository;
    private final int expiredCodeRetentionDays;
    private final int orphanedRankingRetentionDays;

    public RankingDataCleanupService(
            QuizShareCodeRepository shareCodeRepository,
            QuizRankingVersionRepository rankingVersionRepository,
            @Value("${app.ranking-cleanup.expired-code-retention-days:30}") int expiredCodeRetentionDays,
            @Value("${app.ranking-cleanup.orphaned-ranking-retention-days:90}") int orphanedRankingRetentionDays
    ) {
        this.shareCodeRepository = shareCodeRepository;
        this.rankingVersionRepository = rankingVersionRepository;
        this.expiredCodeRetentionDays = expiredCodeRetentionDays;
        this.orphanedRankingRetentionDays = orphanedRankingRetentionDays;
    }

    /** Runs daily at 03:30. A valid code or any quiz owned by a logged-in user protects its ranking version. */
    @Scheduled(cron = "${app.ranking-cleanup.cron:0 30 3 * * *}")
    @Transactional
    public void cleanOrphanedRankingData() {
        LocalDateTime now = LocalDateTime.now();
        shareCodeRepository.deleteExpiredBefore(now.minusDays(expiredCodeRetentionDays));
        rankingVersionRepository.deleteOrphanedBefore(now.minusDays(orphanedRankingRetentionDays), now);
    }
}
