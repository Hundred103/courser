package net.edu.courser.quizservice.service;

import net.edu.courser.quizservice.repository.QuestionRepository;
import net.edu.courser.quizservice.repository.QuizRankingVersionRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.MatchResult;
import java.util.regex.Pattern;

@Service
public class MediaCleanupService {
    private static final Pattern MEDIA_KEY = Pattern.compile("[a-f0-9]{64}\\.(?:jpg|png|gif|webp|bmp)");

    private final QuestionRepository questionRepository;
    private final QuizRankingVersionRepository rankingVersionRepository;
    private final MediaStorageService mediaStorageService;
    private final int unusedRetentionDays;

    public MediaCleanupService(
            QuestionRepository questionRepository,
            QuizRankingVersionRepository rankingVersionRepository,
            MediaStorageService mediaStorageService,
            @Value("${app.media-cleanup.unused-retention-days:30}") int unusedRetentionDays
    ) {
        this.questionRepository = questionRepository;
        this.rankingVersionRepository = rankingVersionRepository;
        this.mediaStorageService = mediaStorageService;
        this.unusedRetentionDays = unusedRetentionDays;
    }

    /** 03:45 cleanup; keep keys referenced by questions/snapshots. */
    @Scheduled(cron = "${app.media-cleanup.cron:0 45 3 * * *}")
    @Transactional(readOnly = true)
    public int deleteUnusedImages() {
        Set<String> usedKeys = new HashSet<>(questionRepository.findAllImageKeys());
        for (String snapshotJson : rankingVersionRepository.findAllSnapshotJson()) {
            MEDIA_KEY.matcher(snapshotJson).results().map(MatchResult::group).forEach(usedKeys::add);
        }
        return mediaStorageService.deleteUnused(usedKeys, Instant.now().minus(Duration.ofDays(unusedRetentionDays)));
    }
}
