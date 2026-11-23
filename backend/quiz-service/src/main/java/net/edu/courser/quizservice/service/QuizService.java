package net.edu.courser.quizservice.service;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import net.edu.courser.quizservice.dto.*;
import net.edu.courser.quizservice.entity.*;
import net.edu.courser.quizservice.exception.RankingCopyRequiredException;
import net.edu.courser.quizservice.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

@Service
@RequiredArgsConstructor
public class QuizService {
    private static final String SHARE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final int SHARE_CODE_LENGTH = 10;
    private static final int LEADERBOARD_SIZE = 5;
    private static final Duration MAX_RANKING_DURATION = Duration.ofHours(6);
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private final QuizRepository quizRepository;
    private final QuestionRepository questionRepository;
    private final QuizShareCodeRepository quizShareCodeRepository;
    private final MapperDTO mapperDTO;
    private final MediaStorageService mediaStorageService;
    private final QuizExportService quizExportService;
    private final QuizRankingVersionRepository rankingVersionRepository;
    private final QuizRankingAttemptRepository rankingAttemptRepository;
    private final QuizRankingEntryRepository rankingEntryRepository;
    private final RankingUserRepository rankingUserRepository;
    private final ObjectMapper objectMapper;

    public record QuizArchive(String title, byte[] bytes) {}

    @Transactional(readOnly = true)
    public List<QuizRawDTO> listForOwner(Long ownerUserId) {
        return toRawDtos(ownerUserId, quizRepository.findByOwnerUserIdOrderByIdAsc(ownerUserId));
    }

    @Transactional(readOnly = true)
    public QuizRawDTO toRawDto(Quiz quiz) {
        return toRawDtos(quiz.getOwnerUserId(), List.of(quiz)).getFirst();
    }

    private List<QuizRawDTO> toRawDtos(Long ownerUserId, List<Quiz> quizzes) {
        if (quizzes.isEmpty()) return List.of();
        Map<Long, Long> questionCounts = questionRepository.countByQuizIds(quizzes.stream().map(Quiz::getId).toList()).stream()
                .collect(Collectors.toMap(QuestionRepository.QuizQuestionCount::getQuizId, QuestionRepository.QuizQuestionCount::getQuestionCount));
        Map<UUID, Integer> positions = rankingPositions(ownerUserId, quizzes);
        return quizzes.stream()
                .map(quiz -> mapperDTO.toQuizRawDTO(quiz, questionCounts.getOrDefault(quiz.getId(), 0L), positionFor(quiz, positions)))
                .toList();
    }

    public Quiz findByIdAndOwnerUserId(Long id, Long ownerUserId) {
        return quizRepository.findByIdAndOwnerUserId(id, ownerUserId)
                .orElseThrow(() -> new EntityNotFoundException("Nie znaleziono quizu."));
    }

    private Quiz findWholeQuizByIdAndOwnerUserId(Long id, Long ownerUserId) {
        return quizRepository.findWholeQuizByIdAndOwnerUserId(id, ownerUserId)
                .orElseThrow(() -> new EntityNotFoundException("Nie znaleziono quizu."));
    }

    @Transactional(readOnly = true)
    public QuizPlayDTO getQuizForPlay(Long id, Long ownerUserId) {
        Quiz quiz = findWholeQuizByIdAndOwnerUserId(id, ownerUserId);
        quiz.getQuestions().forEach(question -> question.getAnswers().size());
        return mapperDTO.toQuizPlayDTO(quiz);
    }

    @Transactional
    public QuizArchive exportQuizArchive(Long id, Long ownerUserId) {
        Quiz quiz = findByIdAndOwnerUserId(id, ownerUserId);
        List<Question> questions = questionRepository.findWholeByQuizId(quiz.getId());
        QuizRankingVersion version = ensureRankingVersion(quiz, questions);
        return new QuizArchive(quiz.getTitle(), quizExportService.exportAsZip(quiz, questions, version.getId().toString()));
    }

    @Transactional
    public Quiz create(QuizCreateDTO dto, Long ownerUserId) {
        Quiz quiz = mapperDTO.toQuizEntity(dto);
        quiz.setOwnerUserId(ownerUserId);
        return save(quiz);
    }

    /** Ensure private ranking version if missing. */
    private Quiz save(Quiz quiz) {
        Quiz saved = quizRepository.save(quiz);
        if (saved.getRankingVersion() == null) {
            ensureRankingVersion(saved, saved.getQuestions());
        }
        return saved;
    }

    @Transactional
    public void delete(Long id, Long ownerUserId) {
        quizRepository.delete(findByIdAndOwnerUserId(id, ownerUserId));
    }

    @Transactional
    public QuizShareCode createShareCode(Long quizId, Long ownerUserId, Long expiresInSeconds) {
        Quiz quiz = findWholeQuizByIdAndOwnerUserId(quizId, ownerUserId);
        QuizRankingVersion version = ensureRankingVersion(quiz, quiz.getQuestions());
        LocalDateTime expiresAt = expiresInSeconds == null ? null : LocalDateTime.now().plusSeconds(expiresInSeconds);

        QuizShareCode shareCode = QuizShareCode.builder()
                .rankingVersion(version)
                .code(generateUniqueShareCode())
                .createdByUserId(ownerUserId)
                .expiresAt(expiresAt)
                .build();

        return quizShareCodeRepository.save(shareCode);
    }

    @Transactional
    public Quiz importByShareCode(String rawCode, Long ownerUserId) {
        QuizRankingVersion version = findRankingVersionByShareCode(rawCode);
        Quiz copiedQuiz = mapperDTO.toQuizEntity(readSnapshot(version));
        copiedQuiz.setOwnerUserId(ownerUserId);
        copiedQuiz.setRankingVersion(version);
        markImportIfShared(version, ownerUserId);

        return quizRepository.save(copiedQuiz);
    }

    /** Freeze version only when another user already owns it. */
    private void markImportIfShared(QuizRankingVersion version, Long importerUserId) {
        if (quizRepository.existsByRankingVersion_IdAndOwnerUserIdNot(version.getId(), importerUserId)) {
            version.setHasLoggedImport(true);
        }
    }

    @Transactional
    public Quiz update(Long id, Long ownerUserId, QuizCreateDTO dto) {
        Quiz quiz = findByIdAndOwnerUserId(id, ownerUserId);
        QuizRankingVersion previousVersion = quiz.getRankingVersion();
        quiz.setTitle(mapperDTO.validTitle(dto.title()));
        mapperDTO.applyScoring(quiz, dto.scoring());
        mapperDTO.applyLimits(quiz, dto.limits());
        boolean customScoring = quiz.getScoringMode() == ScoringMode.CUSTOM;
        quiz.getQuestions().clear();
        dto.questions().forEach(question -> quiz.addQuestion(mapperDTO.toQuestionEntity(question, customScoring)));
        boolean rankingContentChanged = previousVersion == null
                || !previousVersion.getContentHash().equals(rankingContentHash(quiz, quiz.getQuestions()));
        if (previousVersion != null && previousVersion.isHasLoggedImport() && rankingContentChanged) {
            throw new RankingCopyRequiredException();
        }
        // Content change before share → new ranking version (empty leaderboard).
        if (rankingContentChanged) {
            quiz.setRankingVersion(createRankingVersion(quiz, quiz.getQuestions()));
        }
        return quiz;
    }

    @Transactional
    public Quiz updateTitle(Long id, Long ownerUserId, QuizEditTitleDTO dto) {
        Quiz quiz = findByIdAndOwnerUserId(id, ownerUserId);
        quiz.setTitle(mapperDTO.validTitle(dto.title()));
        return quiz;
    }

    /** Server fork: images shared by media key. */
    @Transactional
    public Quiz fork(Long id, Long ownerUserId) {
        Quiz source = findByIdAndOwnerUserId(id, ownerUserId);
        Quiz copy = copyQuiz(source, questionRepository.findWholeByQuizId(source.getId()), ownerUserId);
        copy.setTitle(mapperDTO.copyTitle(source.getTitle()));
        return save(copy);
    }

    @Transactional
    public Quiz importArchive(QuizArchiveImportDTO request, Long ownerUserId) {
        QuizCreateDTO dto = request.quiz();
        boolean migratingGuestQuiz = Boolean.TRUE.equals(request.migratingGuestQuiz());
        Quiz quiz = mapperDTO.toQuizEntity(dto);
        String importedContentHash = rankingContentHash(quiz, quiz.getQuestions());
        QuizRankingVersion matchingVersion = findRankingVersion(request.rankingVersionId())
                .filter(version -> version.getContentHash().equals(importedContentHash))
                .orElse(null);
        if (matchingVersion != null) {
            // Matching version: title/limits from snapshot (not in content hash).
            QuizCreateDTO snapshot = readSnapshot(matchingVersion);
            quiz.setTitle(snapshot.title());
            mapperDTO.applyLimits(quiz, snapshot.limits());
        } else if (request.rankingVersionId() != null && !migratingGuestQuiz) {
            quiz.setTitle(mapperDTO.copyTitle(dto.title()));
        }

        if (migratingGuestQuiz) {
            // Guest migration: dedupe by ranking version id, not title/limits.
            Optional<Quiz> existing = matchingVersion != null
                    ? quizRepository.findFirstByOwnerUserIdAndRankingVersion_IdOrderByIdAsc(ownerUserId, matchingVersion.getId())
                    : findIdenticalQuizByOwnerUserId(ownerUserId, quiz);
            if (existing.isPresent()) {
                return existing.get();
            }
        }
        quiz.setOwnerUserId(ownerUserId);
        if (matchingVersion != null) {
            quiz.setRankingVersion(matchingVersion);
            markImportIfShared(matchingVersion, ownerUserId);
        }
        return save(quiz);
    }

    private Optional<QuizRankingVersion> findRankingVersion(String rawId) {
        if (rawId == null) return Optional.empty();
        try {
            return rankingVersionRepository.findById(UUID.fromString(rawId));
        } catch (IllegalArgumentException invalidId) {
            return Optional.empty();
        }
    }

    @Transactional
    public RankingAttemptStartDTO startRankingAttempt(Long id, Long ownerUserId, UUID clientSessionId) {
        Quiz quiz = findByIdAndOwnerUserId(id, ownerUserId);
        if (quiz.getRankingVersion() == null) throw new IllegalArgumentException("Quiz nie należy do rankingu.");
        if (clientSessionId == null) throw new IllegalArgumentException("Brakuje identyfikatora sesji rozwiązywania.");

        QuizRankingAttempt attempt = rankingAttemptRepository
                .findByRankingVersionIdAndUserIdAndClientSessionId(
                        quiz.getRankingVersion().getId(), ownerUserId, clientSessionId)
                .orElseGet(() -> rankingAttemptRepository.save(QuizRankingAttempt.builder()
                        .rankingVersion(quiz.getRankingVersion())
                        .userId(ownerUserId)
                        .clientSessionId(clientSessionId)
                        .build()));
        if (attempt.isFinished()) {
            throw new IllegalArgumentException("Ta sesja rozwiązywania została już zakończona.");
        }
        return new RankingAttemptStartDTO(attempt.getId(), elapsedMs(attempt, LocalDateTime.now()));
    }

    @Transactional(readOnly = true)
    public RankingLeaderboardDTO getRankingLeaderboard(Long id, Long userId) {
        Quiz quiz = findByIdAndOwnerUserId(id, userId);
        if (quiz.getRankingVersion() == null) return new RankingLeaderboardDTO(null, List.of());
        List<QuizRankingEntry> entries = sortedEntries(quiz.getRankingVersion());
        return new RankingLeaderboardDTO(positionOf(entries, userId), toEntryDtos(entries));
    }

    /** Score against the version the attempt started on. */
    @Transactional
    public RankingFinishDTO finishRankingAttempt(Long id, UUID attemptId, Long userId, RankingFinishRequestDTO request) {
        findByIdAndOwnerUserId(id, userId);
        QuizRankingAttempt attempt = rankingAttemptRepository.findById(attemptId)
                .filter(found -> found.getUserId().equals(userId))
                .orElseThrow(() -> new EntityNotFoundException("Podejście rankingowe nie istnieje."));
        QuizRankingVersion version = attempt.getRankingVersion();
        if (attempt.isFinished()) {
            return new RankingFinishDTO(
                    attempt.getScoreScaled(), attempt.getMaxScoreScaled(), attempt.getDurationMs(),
                    attempt.getPosition(), attempt.getPosition() == null, toEntryDtos(sortedEntries(version))
            );
        }

        QuizCreateDTO snapshot = readSnapshot(version);
        QuizScoringDTO scoring = mapperDTO.normalizeScoring(snapshot.scoring());
        Map<Integer, List<Integer>> submitted = request.answers() == null ? Map.of() : request.answers().stream()
                .collect(Collectors.toMap(RankingAnswerDTO::questionIndex,
                        answer -> answer.answerIndexes() == null ? List.of() : answer.answerIndexes(),
                        (first, ignored) -> first));
        double max = 0;
        double score = 0;
        for (int index = 0; index < snapshot.questions().size(); index++) {
            QuestionCreateDTO question = snapshot.questions().get(index);
            max += maxQuestionScore(question, scoring);
            score += questionScore(question, submitted.getOrDefault(index, List.of()), scoring);
        }
        int maxScaled = Math.max(0, (int) Math.round(max * 100));
        int scoreScaled = (int) Math.round(score * 100);
        LocalDateTime now = LocalDateTime.now();
        long duration = elapsedMs(attempt, now);

        List<QuizRankingEntry> entries = recordBestEntry(QuizRankingEntry.builder()
                .rankingVersion(version).userId(userId).scoreScaled(scoreScaled).maxScoreScaled(maxScaled)
                .durationMs(duration).completedAt(now).build());
        Integer position = positionOf(entries, userId);

        attempt.setCompletedAt(now);
        attempt.setScoreScaled(scoreScaled);
        attempt.setMaxScoreScaled(maxScaled);
        attempt.setDurationMs(duration);
        attempt.setPosition(position);
        rankingAttemptRepository.save(attempt);
        return new RankingFinishDTO(scoreScaled, maxScaled, duration, position, position == null, toEntryDtos(entries));
    }

    /** Best score per user/version; return top 5. */
    private List<QuizRankingEntry> recordBestEntry(QuizRankingEntry candidate) {
        List<QuizRankingEntry> entries = sortedEntries(candidate.getRankingVersion());
        QuizRankingEntry previousBest = entries.stream()
                .filter(entry -> entry.getUserId().equals(candidate.getUserId()))
                .findFirst()
                .orElse(null);
        if (previousBest == null) {
            entries.add(candidate);
        } else if (compareEntries(candidate, previousBest) < 0) {
            previousBest.setScoreScaled(candidate.getScoreScaled());
            previousBest.setMaxScoreScaled(candidate.getMaxScoreScaled());
            previousBest.setDurationMs(candidate.getDurationMs());
            previousBest.setCompletedAt(candidate.getCompletedAt());
            rankingEntryRepository.save(previousBest);
        }
        entries.sort(this::compareEntries);
        while (entries.size() > LEADERBOARD_SIZE) {
            QuizRankingEntry dropped = entries.remove(entries.size() - 1);
            if (dropped != candidate) rankingEntryRepository.delete(dropped);
        }
        if (entries.contains(candidate)) {
            rankingEntryRepository.save(candidate);
        }
        return entries;
    }

    private long elapsedMs(QuizRankingAttempt attempt, LocalDateTime now) {
        return Math.min(MAX_RANKING_DURATION.toMillis(), Math.max(0, Duration.between(attempt.getStartedAt(), now).toMillis()));
    }

    private Quiz copyQuiz(Quiz sourceQuiz, List<Question> sourceQuestions, Long ownerUserId) {
        Quiz copiedQuiz = Quiz.builder()
                .title(sourceQuiz.getTitle())
                .ownerUserId(ownerUserId)
                .scoringMode(sourceQuiz.getScoringMode())
                .allowNegativeScore(sourceQuiz.isAllowNegativeScore())
                .pointsPerCorrect(sourceQuiz.getPointsPerCorrect())
                .incorrectPenalty(sourceQuiz.getIncorrectPenalty())
                .penaltyMode(sourceQuiz.getPenaltyMode())
                .randomQuestionOrder(sourceQuiz.isRandomQuestionOrder())
                .showCorrectAnswers(sourceQuiz.isShowCorrectAnswers())
                .build();

        sourceQuestions.forEach(sourceQuestion -> {
            Question copiedQuestion = Question.builder()
                    .content(sourceQuestion.getContent())
                    .imageKey(sourceQuestion.getImageKey())
                    .build();
            sourceQuestion.getAnswers().forEach(sourceAnswer -> copiedQuestion.addAnswer(Answer.builder()
                    .content(sourceAnswer.getContent())
                    .correct(sourceAnswer.isCorrect())
                    .points(sourceAnswer.getPoints())
                    .build()));
            copiedQuiz.addQuestion(copiedQuestion);
        });

        return copiedQuiz;
    }

    private String generateUniqueShareCode() {
        for (int attempt = 0; attempt < 20; attempt++) {
            String code = generateShareCode();
            if (!quizShareCodeRepository.existsByCode(code)) {
                return code;
            }
        }
        throw new IllegalStateException("Could not generate unique share code");
    }

    private String generateShareCode() {
        StringBuilder code = new StringBuilder(SHARE_CODE_LENGTH);
        for (int index = 0; index < SHARE_CODE_LENGTH; index++) {
            code.append(SHARE_CODE_ALPHABET.charAt(SECURE_RANDOM.nextInt(SHARE_CODE_ALPHABET.length())));
        }
        return code.toString();
    }

    private String normalizeShareCode(String rawCode) {
        String code = rawCode == null ? "" : rawCode.replaceAll("[^A-Za-z0-9]", "").toUpperCase();
        if (code.length() != SHARE_CODE_LENGTH) {
            throw new EntityNotFoundException("Nie znaleziono kodu udostępniania.");
        }
        return code;
    }

    private QuizRankingVersion ensureRankingVersion(Quiz quiz, List<Question> questions) {
        String hash = rankingContentHash(quiz, questions);
        if (quiz.getRankingVersion() != null && hash.equals(quiz.getRankingVersion().getContentHash())) return quiz.getRankingVersion();
        QuizRankingVersion version = createRankingVersion(quiz, questions);
        quiz.setRankingVersion(version);
        return version;
    }

    private QuizRankingVersion createRankingVersion(Quiz quiz, List<Question> questions) {
        QuizCreateDTO snapshot = toCreateDto(quiz, questions);
        return rankingVersionRepository.save(QuizRankingVersion.builder()
                .snapshotJson(objectMapper.writeValueAsString(snapshot))
                .contentHash(contentHashOf(snapshot))
                .build());
    }

    @Transactional(readOnly = true)
    public QuizRankingVersion findRankingVersionByShareCode(String rawCode) {
        QuizShareCode shareCode = quizShareCodeRepository.findByCode(normalizeShareCode(rawCode))
                .orElseThrow(() -> new EntityNotFoundException("Nie znaleziono kodu udostępniania."));
        if (shareCode.getExpiresAt() != null && !shareCode.getExpiresAt().isAfter(LocalDateTime.now())) {
            throw new EntityNotFoundException("Kod udostępniania wygasł.");
        }
        return shareCode.getRankingVersion();
    }

    public QuizCreateDTO readSnapshot(QuizRankingVersion version) {
        return objectMapper.readValue(version.getSnapshotJson(), QuizCreateDTO.class);
    }

    private QuizCreateDTO toCreateDto(Quiz quiz, List<Question> questions) {
        return new QuizCreateDTO(quiz.getTitle(), questions.stream().map(this::toQuestionCreateDTO).toList(), mapperDTO.toScoringDto(quiz), mapperDTO.toLimitsDto(quiz));
    }

    private QuestionCreateDTO toQuestionCreateDTO(Question question) {
        return new QuestionCreateDTO(
                question.getContent(),
                question.getAnswers().stream()
                        .map(answer -> new AnswerCreateDTO(answer.getContent(), answer.isCorrect(), answer.getPoints()))
                        .toList(),
                mediaStorageService.publicUrl(question.getImageKey())
        );
    }

    /** Content hash after MapperDTO persist (image media keys). */
    private String rankingContentHash(Quiz quiz, List<Question> questions) {
        return contentHashOf(toCreateDto(quiz, questions));
    }

    private String contentHashOf(QuizCreateDTO dto) {
        ObjectNode root = objectMapper.createObjectNode();
        root.set("questions", objectMapper.valueToTree(dto.questions()));
        root.set("scoring", objectMapper.valueToTree(mapperDTO.normalizeScoring(dto.scoring())));
        return sha256(objectMapper.writeValueAsBytes(root));
    }

    private Optional<Quiz> findIdenticalQuizByOwnerUserId(Long ownerUserId, Quiz candidate) {
        String candidateHash = fullQuizContentHash(candidate, candidate.getQuestions());
        return quizRepository.findByOwnerUserIdOrderByIdAsc(ownerUserId).stream()
                .filter(existing -> candidateHash.equals(fullQuizContentHash(existing, questionRepository.findWholeByQuizId(existing.getId()))))
                .findFirst();
    }

    private String fullQuizContentHash(Quiz quiz, List<Question> questions) {
        ObjectNode root = objectMapper.createObjectNode();
        root.put("title", quiz.getTitle());
        root.set("questions", objectMapper.valueToTree(questions.stream().map(this::toQuestionCreateDTO).toList()));
        root.set("scoring", objectMapper.valueToTree(mapperDTO.toScoringDto(quiz)));
        root.set("limits", objectMapper.valueToTree(mapperDTO.toLimitsDto(quiz)));
        return sha256(objectMapper.writeValueAsBytes(root));
    }

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 unavailable", exception);
        }
    }

    private List<QuizRankingEntry> sortedEntries(QuizRankingVersion version) {
        List<QuizRankingEntry> entries = new ArrayList<>(rankingEntryRepository.findByRankingVersion(version));
        entries.sort(this::compareEntries);
        return entries;
    }

    /** Caller top-5 place per ranking version (one query). */
    private Map<UUID, Integer> rankingPositions(Long userId, Collection<Quiz> quizzes) {
        List<UUID> versionIds = quizzes.stream()
                .map(Quiz::getRankingVersion)
                .filter(Objects::nonNull)
                .map(QuizRankingVersion::getId)
                .distinct()
                .toList();
        if (versionIds.isEmpty()) return Map.of();
        return rankingEntryRepository.findByRankingVersion_IdIn(versionIds).stream()
                .collect(Collectors.groupingBy(entry -> entry.getRankingVersion().getId()))
                .entrySet().stream()
                .filter(group -> group.getValue().stream().anyMatch(entry -> entry.getUserId().equals(userId)))
                .collect(Collectors.toMap(Map.Entry::getKey, group -> {
                    List<QuizRankingEntry> entries = new ArrayList<>(group.getValue());
                    entries.sort(this::compareEntries);
                    return positionOf(entries, userId);
                }));
    }

    private static Integer positionFor(Quiz quiz, Map<UUID, Integer> positions) {
        return quiz.getRankingVersion() == null ? null : positions.get(quiz.getRankingVersion().getId());
    }

    private static Integer positionOf(List<QuizRankingEntry> sortedEntries, Long userId) {
        for (int index = 0; index < sortedEntries.size(); index++) {
            if (sortedEntries.get(index).getUserId().equals(userId)) return index + 1;
        }
        return null;
    }

    private int compareEntries(QuizRankingEntry left, QuizRankingEntry right) {
        long a = (long) left.getScoreScaled() * right.getMaxScoreScaled();
        long b = (long) right.getScoreScaled() * left.getMaxScoreScaled();
        if (a != b) return Long.compare(b, a);
        int duration = Long.compare(left.getDurationMs(), right.getDurationMs());
        if (duration != 0) return duration;
        return left.getCompletedAt().compareTo(right.getCompletedAt());
    }

    private List<RankingEntryDTO> toEntryDtos(List<QuizRankingEntry> entries) {
        Map<Long, String> usernames = rankingUserRepository
                .findAllById(entries.stream().map(QuizRankingEntry::getUserId).toList()).stream()
                .collect(Collectors.toMap(RankingUser::getId, RankingUser::getUsername));
        return IntStream.range(0, entries.size()).mapToObj(index -> {
            QuizRankingEntry entry = entries.get(index);
            return new RankingEntryDTO(index + 1, usernames.getOrDefault(entry.getUserId(), "Użytkownik"),
                    entry.getScoreScaled(), entry.getMaxScoreScaled(), entry.getDurationMs());
        }).toList();
    }

    /** Mirror quiz-scoring.util.ts; normalized scoring only. */
    private double maxQuestionScore(QuestionCreateDTO question, QuizScoringDTO scoring) {
        if ("custom".equals(scoring.mode())) {
            return question.answers().stream().filter(AnswerCreateDTO::correct).mapToDouble(answer -> answer.points() == null ? 0 : answer.points()).sum();
        }
        long correct = question.answers().stream().filter(AnswerCreateDTO::correct).count();
        if ("fraction".equals(scoring.penaltyMode())) return correct == 0 ? 0 : scoring.pointsPerCorrect();
        return scoring.pointsPerCorrect() * correct;
    }

    /** Expects normalized scoring. */
    private double questionScore(QuestionCreateDTO question, List<Integer> indexes, QuizScoringDTO scoring) {
        List<AnswerCreateDTO> answers = question.answers();
        List<AnswerCreateDTO> selected = indexes.stream()
                .filter(index -> index != null && index >= 0 && index < answers.size())
                .distinct()
                .map(answers::get)
                .toList();
        double value;
        if ("custom".equals(scoring.mode())) {
            value = selected.stream().mapToDouble(answer -> answer.points() == null ? 0 : answer.points()).sum();
        } else {
            long correct = answers.stream().filter(AnswerCreateDTO::correct).count();
            long incorrect = answers.size() - correct;
            long selectedCorrect = selected.stream().filter(AnswerCreateDTO::correct).count();
            long selectedIncorrect = selected.size() - selectedCorrect;
            if ("fraction".equals(scoring.penaltyMode())) {
                value = (correct == 0 ? 0 : (double) selectedCorrect / correct) - (incorrect == 0 ? 0 : (double) selectedIncorrect / incorrect);
            } else if ("percent".equals(scoring.penaltyMode())) {
                value = selectedCorrect * scoring.pointsPerCorrect() * (1 - (selectedIncorrect * scoring.incorrectPenalty() / 100));
            } else {
                value = selectedCorrect * scoring.pointsPerCorrect() - selectedIncorrect * scoring.incorrectPenalty();
            }
        }
        return !scoring.allowNegativeScore() && value < 0 ? 0 : value;
    }
}
