package net.edu.courser.quizservice.service;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import net.edu.courser.quizservice.dto.AnswerCreateDTO;
import net.edu.courser.quizservice.dto.MapperDTO;
import net.edu.courser.quizservice.dto.QuestionCreateDTO;
import net.edu.courser.quizservice.dto.QuizArchiveImportDTO;
import net.edu.courser.quizservice.dto.QuizCreateDTO;
import net.edu.courser.quizservice.entity.Quiz;
import net.edu.courser.quizservice.entity.QuizRankingVersion;
import net.edu.courser.quizservice.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class QuizServiceRankingHashTest {
    private static final long OWNER = 7L;
    private static final String INLINE_IMAGE =
            "data:image/png;base64," + Base64.getEncoder().encodeToString(MediaStorageServiceTest.png(1));

    @TempDir
    Path storage;

    private QuizRepository quizRepository;
    private QuizRankingVersionRepository rankingVersionRepository;
    private MediaStorageService mediaStorageService;
    private QuizService quizService;

    @BeforeEach
    void setUp() {
        quizRepository = mock(QuizRepository.class);
        rankingVersionRepository = mock(QuizRankingVersionRepository.class);
        mediaStorageService = new MediaStorageService(storage.toString(), "/media");
        when(quizRepository.save(any(Quiz.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(rankingVersionRepository.save(any(QuizRankingVersion.class))).thenAnswer(invocation -> {
            QuizRankingVersion version = invocation.getArgument(0);
            version.setId(UUID.randomUUID());
            return version;
        });
        ObjectMapper objectMapper = JsonMapper.builder().build();
        quizService = new QuizService(
                quizRepository,
                mock(QuestionRepository.class),
                mock(QuizShareCodeRepository.class),
                new MapperDTO(mediaStorageService),
                mediaStorageService,
                new QuizExportService(objectMapper, mediaStorageService, new MapperDTO(mediaStorageService)),
                rankingVersionRepository,
                mock(QuizRankingAttemptRepository.class),
                mock(QuizRankingEntryRepository.class),
                mock(RankingUserRepository.class),
                objectMapper
        );
    }

    @Test
    void savingAgainAfterAddingAnImageKeepsTheSharedRanking() {
        Quiz quiz = quizService.create(quiz("Quiz", null), OWNER);
        when(quizRepository.findByIdAndOwnerUserId(1L, OWNER)).thenReturn(Optional.of(quiz));

        quizService.update(1L, OWNER, quiz("Quiz", INLINE_IMAGE));
        QuizRankingVersion versionWithImage = quiz.getRankingVersion();
        versionWithImage.setHasLoggedImport(true);
        String storedImage = mediaStorageService.publicUrl(quiz.getQuestions().getFirst().getImageKey());

        quizService.update(1L, OWNER, quiz("Renamed quiz", storedImage));

        assertThat(quiz.getRankingVersion()).isSameAs(versionWithImage);
    }

    @Test
    void zipWithImagesRejoinsItsRankingVersion() {
        Quiz original = quizService.create(quiz("Quiz", INLINE_IMAGE), OWNER);
        QuizRankingVersion version = original.getRankingVersion();
        when(rankingVersionRepository.findById(version.getId())).thenReturn(Optional.of(version));
        when(quizRepository.existsByRankingVersion_IdAndOwnerUserIdNot(version.getId(), 8L)).thenReturn(true);

        Quiz imported = quizService.importArchive(
                new QuizArchiveImportDTO(quiz("Quiz", INLINE_IMAGE), version.getId().toString(), false), 8L);

        assertThat(imported.getRankingVersion()).isSameAs(version);
        assertThat(imported.getTitle()).isEqualTo("Quiz");
        assertThat(version.isHasLoggedImport()).isTrue();
    }

    private static QuizCreateDTO quiz(String title, String image) {
        return new QuizCreateDTO(
                title,
                List.of(new QuestionCreateDTO("2 + 2?", List.of(
                        new AnswerCreateDTO("4", true, null),
                        new AnswerCreateDTO("5", false, null)
                ), image)),
                null,
                null
        );
    }
}
