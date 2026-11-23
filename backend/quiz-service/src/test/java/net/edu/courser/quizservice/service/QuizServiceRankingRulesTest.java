package net.edu.courser.quizservice.service;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import net.edu.courser.quizservice.dto.*;
import net.edu.courser.quizservice.entity.Quiz;
import net.edu.courser.quizservice.entity.QuizRankingAttempt;
import net.edu.courser.quizservice.entity.QuizRankingVersion;
import net.edu.courser.quizservice.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class QuizServiceRankingRulesTest {
    private static final long OWNER = 7L;
    private static final QuizScoringDTO POINTS = new QuizScoringDTO("default", false, 1d, 0d, "points");
    private static final QuizScoringDTO CUSTOM = new QuizScoringDTO("custom", false, 1d, 0d, "points");

    @TempDir
    Path storage;

    private QuizRepository quizRepository;
    private QuizRankingVersionRepository rankingVersionRepository;
    private QuizRankingAttemptRepository rankingAttemptRepository;
    private QuestionRepository questionRepository;
    private MapperDTO mapperDTO;
    private QuizService quizService;

    @BeforeEach
    void setUp() {
        quizRepository = mock(QuizRepository.class);
        rankingVersionRepository = mock(QuizRankingVersionRepository.class);
        rankingAttemptRepository = mock(QuizRankingAttemptRepository.class);
        questionRepository = mock(QuestionRepository.class);
        QuizRankingEntryRepository rankingEntryRepository = mock(QuizRankingEntryRepository.class);
        MediaStorageService mediaStorageService = new MediaStorageService(storage.toString(), "/media");
        mapperDTO = new MapperDTO(mediaStorageService);
        when(quizRepository.save(any(Quiz.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(rankingVersionRepository.save(any(QuizRankingVersion.class))).thenAnswer(invocation -> {
            QuizRankingVersion version = invocation.getArgument(0);
            version.setId(UUID.randomUUID());
            return version;
        });
        when(rankingEntryRepository.findByRankingVersion(any())).thenAnswer(invocation -> new ArrayList<>());
        ObjectMapper objectMapper = JsonMapper.builder().build();
        quizService = new QuizService(
                quizRepository,
                questionRepository,
                mock(QuizShareCodeRepository.class),
                mapperDTO,
                mediaStorageService,
                new QuizExportService(objectMapper, mediaStorageService, new MapperDTO(mediaStorageService)),
                rankingVersionRepository,
                rankingAttemptRepository,
                rankingEntryRepository,
                mock(RankingUserRepository.class),
                objectMapper
        );
    }

    @Test
    void pointsModeMaximumCountsEveryCorrectAnswer() {
        RankingFinishDTO result = finish(POINTS, List.of(
                new AnswerCreateDTO("a", true, null),
                new AnswerCreateDTO("b", true, null),
                new AnswerCreateDTO("c", false, null)
        ), List.of(0, 1));

        assertThat(result.scoreScaled()).isEqualTo(200);
        assertThat(result.maxScoreScaled()).isEqualTo(200);
    }

    @Test
    void customModeRespectsDisabledNegativeScore() {
        RankingFinishDTO result = finish(CUSTOM, List.of(
                new AnswerCreateDTO("a", true, 2d),
                new AnswerCreateDTO("b", false, -1d)
        ), List.of(1));

        assertThat(result.scoreScaled()).isZero();
    }

    @Test
    void identicalAnswersAreScoredByPosition() {
        RankingFinishDTO result = finish(CUSTOM, List.of(
                new AnswerCreateDTO("same", true, 1d),
                new AnswerCreateDTO("same", true, 1d)
        ), List.of(1));

        assertThat(result.scoreScaled()).isEqualTo(100);
        assertThat(result.maxScoreScaled()).isEqualTo(200);
    }

    @Test
    void repeatedIndexesCountOnce() {
        RankingFinishDTO result = finish(POINTS, List.of(
                new AnswerCreateDTO("a", true, null),
                new AnswerCreateDTO("b", true, null)
        ), List.of(0, 0, 0));

        assertThat(result.scoreScaled()).isEqualTo(100);
    }

    @Test
    void attemptStartedBeforeAnEditIsStillScored() {
        Quiz quiz = savedQuiz(POINTS, List.of(new AnswerCreateDTO("a", true, null), new AnswerCreateDTO("b", false, null)));
        QuizRankingAttempt attempt = startedAttempt(quiz.getRankingVersion());
        quiz.setRankingVersion(null);

        RankingFinishDTO result = quizService.finishRankingAttempt(1L, attempt.getId(), OWNER,
                new RankingFinishRequestDTO(List.of(new RankingAnswerDTO(0, List.of(0)))));

        assertThat(result.scoreScaled()).isEqualTo(100);
    }

    @Test
    void startingAFinishedSessionAgainIsABadRequest() {
        Quiz quiz = savedQuiz(POINTS, List.of(new AnswerCreateDTO("a", true, null)));
        QuizRankingAttempt finished = startedAttempt(quiz.getRankingVersion());
        finished.setCompletedAt(LocalDateTime.now());
        when(rankingAttemptRepository.findByRankingVersionIdAndUserIdAndClientSessionId(
                quiz.getRankingVersion().getId(), OWNER, finished.getClientSessionId())).thenReturn(Optional.of(finished));

        assertThatThrownBy(() -> quizService.startRankingAttempt(1L, OWNER, finished.getClientSessionId()))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void reimportingYourOwnQuizDoesNotFreezeIt() {
        Quiz quiz = savedQuiz(POINTS, List.of(new AnswerCreateDTO("a", true, null)));
        QuizRankingVersion version = quiz.getRankingVersion();
        when(rankingVersionRepository.findById(version.getId())).thenReturn(Optional.of(version));

        quizService.importArchive(new QuizArchiveImportDTO(dto(POINTS, List.of(new AnswerCreateDTO("a", true, null))),
                version.getId().toString(), false), OWNER);

        assertThat(version.isHasLoggedImport()).isFalse();
    }

    @Test
    void titlesAreLimitedToTheColumnLength() {
        assertThatThrownBy(() -> mapperDTO.validTitle("x".repeat(256))).isInstanceOf(IllegalArgumentException.class);
        assertThat(mapperDTO.copyTitle("x".repeat(255))).hasSize(255).endsWith(" (kopia)");
        assertThat(mapperDTO.copyTitle("Quiz")).isEqualTo("Quiz (kopia)");
        assertThatThrownBy(() -> mapperDTO.validTitle("  ")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void questionWithoutCorrectAnswerIsWorthNothingInFractionMode() {
        RankingFinishDTO result = finish(null, List.of(
                new AnswerCreateDTO("a", false, null),
                new AnswerCreateDTO("b", false, null)
        ), List.of());

        assertThat(result.scoreScaled()).isZero();
        assertThat(result.maxScoreScaled()).isZero();
    }

    @Test
    void forkCopiesOnTheServerAndKeepsImageKeys() {
        Quiz source = quizService.create(dto(POINTS, List.of(new AnswerCreateDTO("a", true, null))), OWNER);
        source.getQuestions().getFirst().setImageKey("a".repeat(64) + ".png");
        when(quizRepository.findByIdAndOwnerUserId(1L, OWNER)).thenReturn(Optional.of(source));
        when(questionRepository.findWholeByQuizId(any())).thenReturn(source.getQuestions());

        Quiz copy = quizService.fork(1L, OWNER);

        assertThat(copy).isNotSameAs(source);
        assertThat(copy.getTitle()).isEqualTo("Quiz (kopia)");
        assertThat(copy.getQuestions().getFirst().getImageKey()).isEqualTo("a".repeat(64) + ".png");
        assertThat(copy.getRankingVersion()).isNotSameAs(source.getRankingVersion());
    }

    private RankingFinishDTO finish(QuizScoringDTO scoring, List<AnswerCreateDTO> answers, List<Integer> selected) {
        Quiz quiz = savedQuiz(scoring, answers);
        QuizRankingAttempt attempt = startedAttempt(quiz.getRankingVersion());
        return quizService.finishRankingAttempt(1L, attempt.getId(), OWNER,
                new RankingFinishRequestDTO(List.of(new RankingAnswerDTO(0, selected))));
    }

    private Quiz savedQuiz(QuizScoringDTO scoring, List<AnswerCreateDTO> answers) {
        Quiz quiz = quizService.create(dto(scoring, answers), OWNER);
        when(quizRepository.findByIdAndOwnerUserId(1L, OWNER)).thenReturn(Optional.of(quiz));
        return quiz;
    }

    private QuizRankingAttempt startedAttempt(QuizRankingVersion version) {
        QuizRankingAttempt attempt = QuizRankingAttempt.builder()
                .id(UUID.randomUUID())
                .rankingVersion(version)
                .userId(OWNER)
                .clientSessionId(UUID.randomUUID())
                .startedAt(LocalDateTime.now())
                .build();
        when(rankingAttemptRepository.findById(attempt.getId())).thenReturn(Optional.of(attempt));
        return attempt;
    }

    private static QuizCreateDTO dto(QuizScoringDTO scoring, List<AnswerCreateDTO> answers) {
        return new QuizCreateDTO("Quiz", List.of(new QuestionCreateDTO("Pytanie?", answers, null)), scoring, null);
    }
}
