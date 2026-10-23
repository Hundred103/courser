package net.edu.courser.quizservice.service;
import net.edu.courser.quizservice.dto.*;
import net.edu.courser.quizservice.repository.QuestionRepository;
import net.edu.courser.quizservice.repository.QuizShareCodeRepository;
import net.edu.courser.quizservice.repository.QuizRepository;
import net.edu.courser.quizservice.entity.*;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import jakarta.persistence.EntityNotFoundException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import java.util.Comparator;
import net.edu.courser.quizservice.repository.*;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.List;



@Service
public class QuizService {
    private static final String SHARE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final int SHARE_CODE_LENGTH = 10;
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private final QuizRepository quizRepository;
    private final QuestionRepository questionRepository;
    private final QuizShareCodeRepository quizShareCodeRepository;
    private final MapperDTO mapperDTO;
    private final ImageCompressor imageCompressor;
    private final QuizExportService quizExportService;
    private final QuizRankingVersionRepository rankingVersionRepository;
    private final QuizRankingAttemptRepository rankingAttemptRepository;
    private final QuizRankingEntryRepository rankingEntryRepository;
    private final RankingUserRepository rankingUserRepository;
    private final ObjectMapper objectMapper;

    public QuizService(
            QuizRepository quizRepository,
            QuestionRepository questionRepository,
            QuizShareCodeRepository quizShareCodeRepository,
            MapperDTO mapperDTO,
            ImageCompressor imageCompressor,
            QuizExportService quizExportService,
            QuizRankingVersionRepository rankingVersionRepository,
            QuizRankingAttemptRepository rankingAttemptRepository,
            QuizRankingEntryRepository rankingEntryRepository,
            RankingUserRepository rankingUserRepository,
            ObjectMapper objectMapper
    ) {
        this.quizRepository = quizRepository;
        this.questionRepository = questionRepository;
        this.quizShareCodeRepository = quizShareCodeRepository;
        this.mapperDTO = mapperDTO;
        this.imageCompressor = imageCompressor;
        this.quizExportService = quizExportService;
        this.rankingVersionRepository = rankingVersionRepository;
        this.rankingAttemptRepository = rankingAttemptRepository;
        this.rankingEntryRepository = rankingEntryRepository;
        this.rankingUserRepository = rankingUserRepository;
        this.objectMapper = objectMapper;
    }

    public List<Quiz> findAllByOwnerUserId(Long ownerUserId) {
        return quizRepository.findByOwnerUserId(ownerUserId, Sort.by(Sort.Direction.ASC, "id"));
    }

    public Quiz findByIdAndOwnerUserId(Long id, Long ownerUserId) {
        return quizRepository.findByIdAndOwnerUserId(id, ownerUserId)
                .orElseThrow(() -> new EntityNotFoundException("Quiz not found"));
    }

    public Quiz findWholeQuizByIdAndOwnerUserId(Long id, Long ownerUserId) {
        return quizRepository.findWholeQuizByIdAndOwnerUserId(id, ownerUserId)
                .orElseThrow(() -> new EntityNotFoundException("Quiz not found"));
    }

    @Transactional(readOnly = true)
    public QuizPlayDTO getQuizForPlay(Long id, Long ownerUserId) {
        Quiz quiz = findWholeQuizByIdAndOwnerUserId(id, ownerUserId);
        quiz.getQuestions().forEach(question -> question.getAnswers().size());
        return mapperDTO.toQuizPlayDTO(quiz);
    }

    @Transactional
    public byte[] exportQuizArchive(Long id, Long ownerUserId) {
        Quiz quiz = findWholeQuizByIdAndOwnerUserId(id, ownerUserId);
        List<Question> questions = questionRepository.findWholeByQuizId(quiz.getId());
        QuizRankingVersion version = ensureRankingVersion(quiz, questions);
        return quizExportService.exportAsZip(quiz, questions, version.getId().toString(), version.getContentHash());
    }

    public List<Question> findWholeQuestionsByQuizId(Long quizId) {
        return questionRepository.findWholeByQuizId(quizId);
    }

    @Transactional
    public Quiz save(Quiz quiz) {
        Quiz saved = quizRepository.save(quiz);
        // Każdy nowy quiz jest od razu własną, prywatną wersją rankingową.
        if (saved.getRankingVersion() == null) {
            ensureRankingVersion(saved, saved.getQuestions());
        }
        return saved;
    }

    public void delete(Quiz quiz) {
        quizRepository.delete(quiz);
    }

    @Transactional
    public QuizShareCode createShareCode(Long quizId, Long ownerUserId, Long expiresInSeconds) {
        Quiz quiz = findWholeQuizByIdAndOwnerUserId(quizId, ownerUserId);
        QuizRankingVersion version = ensureRankingVersion(quiz, quiz.getQuestions());
        LocalDateTime expiresAt = expiresInSeconds == null ? null : LocalDateTime.now().plusSeconds(expiresInSeconds);

        QuizShareCode shareCode = QuizShareCode.builder()
                .quiz(quiz)
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
        QuizCreateDTO snapshot = readSnapshot(version);
        Quiz copiedQuiz = mapperDTO.toQuizEntity(snapshot);
        copiedQuiz.setOwnerUserId(ownerUserId);
        copiedQuiz.setRankingVersion(version);
        version.setHasLoggedImport(true);

        return quizRepository.save(copiedQuiz);
    }

    @Transactional(readOnly = true)
    public QuizCreateDTO getCreateDtoByShareCode(String rawCode) {
        return readSnapshot(findRankingVersionByShareCode(rawCode));
    }

    @Transactional
    public Quiz update(Long id, Long ownerUserId, QuizCreateDTO dto) {
        Quiz quiz = quizRepository.findByIdAndOwnerUserId(id, ownerUserId)
                .orElseThrow(() -> new EntityNotFoundException("Quiz not found"));
        boolean rankingContentChanged = quiz.getRankingVersion() == null
                || !quiz.getRankingVersion().getContentHash().equals(rankingContentHash(dto));
        if (quiz.getRankingVersion() != null && quiz.getRankingVersion().isHasLoggedImport()
                && rankingContentChanged) {
            throw new IllegalStateException("RANKING_COPY_REQUIRED");
        }
        quiz.setTitle(dto.title());
        mapperDTO.applyScoring(quiz, dto.scoring());
        mapperDTO.applyLimits(quiz, dto.limits());
        boolean customScoring = quiz.getScoringMode() == ScoringMode.CUSTOM;
        quiz.getQuestions().clear();
        for (int index = 0; index < dto.questions().size(); index++) {
            quiz.addQuestion(mapperDTO.toQuestionEntity(dto.questions().get(index), index, customScoring));
        }
        // Przed pierwszym importem można zmieniać quiz bez tworzenia kopii, ale
        // zmieniona treść zaczyna nową, pustą tabelę wyników.
        if (rankingContentChanged) {
            quiz.setRankingVersion(createRankingVersion(dto));
        }
        return quiz;
    }

    @Transactional
    public Quiz updateTitle(Long id, Long ownerUserId, QuizEditTitleDTO dto) {
        Quiz quiz = quizRepository.findByIdAndOwnerUserId(id, ownerUserId)
                .orElseThrow(() -> new EntityNotFoundException("Quiz not found"));
        quiz.setTitle(dto.title());
        return quiz;
    }

    @Transactional
    public Quiz fork(Long id, Long ownerUserId, QuizCreateDTO dto) {
        findByIdAndOwnerUserId(id, ownerUserId);
        Quiz copy = mapperDTO.toQuizEntity(dto);
        copy.setOwnerUserId(ownerUserId);
        copy.setTitle(dto.title() + " (kopia)");
        Quiz saved = quizRepository.save(copy);
        saved.setRankingVersion(ensureRankingVersion(saved, saved.getQuestions()));
        return saved;
    }

    @Transactional
    public Quiz importArchive(QuizArchiveImportDTO request, Long ownerUserId) {
        QuizCreateDTO dto = request.quiz();
        Quiz quiz = mapperDTO.toQuizEntity(dto);
        quiz.setOwnerUserId(ownerUserId);
        if (request.rankingVersionId() != null) {
            try {
                QuizRankingVersion version = rankingVersionRepository.findById(UUID.fromString(request.rankingVersionId())).orElse(null);
                if (version != null && version.getContentHash().equals(rankingContentHash(dto))) {
                    quiz.setRankingVersion(version); version.setHasLoggedImport(true);
                } else quiz.setTitle(dto.title() + " (kopia)");
            } catch (IllegalArgumentException ignored) { quiz.setTitle(dto.title() + " (kopia)"); }
        }
        Quiz saved = quizRepository.save(quiz);
        if (saved.getRankingVersion() == null) saved.setRankingVersion(ensureRankingVersion(saved, saved.getQuestions()));
        return saved;
    }

    @Transactional
    public RankingAttemptStartDTO startRankingAttempt(Long id, Long ownerUserId) {
        Quiz quiz = findByIdAndOwnerUserId(id, ownerUserId);
        if (quiz.getRankingVersion() == null) throw new IllegalStateException("Quiz nie należy do rankingu.");
        QuizRankingAttempt attempt = rankingAttemptRepository.save(QuizRankingAttempt.builder().rankingVersion(quiz.getRankingVersion()).userId(ownerUserId).build());
        return new RankingAttemptStartDTO(attempt.getId());
    }

    @Transactional(readOnly = true)
    public RankingPositionDTO getRankingPosition(Long id, Long userId) {
        Quiz quiz = findByIdAndOwnerUserId(id, userId);
        if (quiz.getRankingVersion() == null) return new RankingPositionDTO(null);
        List<QuizRankingEntry> entries = rankingEntryRepository.findByRankingVersion(quiz.getRankingVersion());
        entries.sort(this::compareEntries);
        for (int index = 0; index < entries.size(); index++) if (entries.get(index).getUserId().equals(userId)) return new RankingPositionDTO(index + 1);
        return new RankingPositionDTO(null);
    }

    @Transactional(readOnly = true)
    public RankingLeaderboardDTO getRankingLeaderboard(Long id, Long userId) {
        Quiz quiz = findByIdAndOwnerUserId(id, userId);
        if (quiz.getRankingVersion() == null) return new RankingLeaderboardDTO(null, List.of());

        List<QuizRankingEntry> entries = rankingEntryRepository.findByRankingVersion(quiz.getRankingVersion());
        entries.sort(this::compareEntries);

        Integer position = null;
        for (int index = 0; index < entries.size(); index++) {
            if (entries.get(index).getUserId().equals(userId)) {
                position = index + 1;
                break;
            }
        }

        return new RankingLeaderboardDTO(position, toEntryDtos(entries));
    }

    @Transactional
    public RankingFinishDTO finishRankingAttempt(Long id, UUID attemptId, Long userId, RankingFinishRequestDTO request) {
        Quiz quiz = findByIdAndOwnerUserId(id, userId);
        QuizRankingAttempt attempt = rankingAttemptRepository.findById(attemptId).orElseThrow(() -> new EntityNotFoundException("Podejście rankingowe nie istnieje."));
        if (!attempt.getUserId().equals(userId) || !attempt.getRankingVersion().getId().equals(quiz.getRankingVersion().getId()) || !"STARTED".equals(attempt.getStatus())) throw new IllegalStateException("Niepoprawne podejście rankingowe.");
        QuizCreateDTO snapshot = readSnapshot(attempt.getRankingVersion());
        int max = Math.max(0, (int)Math.round(snapshot.questions().stream().mapToDouble(q -> maxQuestionScore(q, snapshot.scoring())).sum() * 100));
        Map<Integer, List<Integer>> submitted = request.answers() == null ? Map.of() : request.answers().stream().collect(java.util.stream.Collectors.toMap(RankingAnswerDTO::questionIndex, a -> a.answerIndexes() == null ? List.of() : a.answerIndexes(), (a,b)->a));
        double score = 0;
        for (int i=0;i<snapshot.questions().size();i++) score += questionScore(snapshot.questions().get(i), submitted.getOrDefault(i, List.of()), snapshot.scoring());
        int scaled = (int)Math.round(score * 100);
        long duration = Math.max(0, Duration.between(attempt.getStartedAt(), LocalDateTime.now()).toMillis());
        attempt.setCompletedAt(LocalDateTime.now()); attempt.setStatus("FINISHED");
        QuizRankingVersion version = attempt.getRankingVersion();
        QuizRankingEntry candidate = QuizRankingEntry.builder().rankingVersion(version).userId(userId).scoreScaled(scaled).maxScoreScaled(max).durationMs(duration).completedAt(attempt.getCompletedAt()).build();
        List<QuizRankingEntry> entries = new java.util.ArrayList<>(rankingEntryRepository.findByRankingVersion(version));
        QuizRankingEntry previousBest = rankingEntryRepository.findByRankingVersionAndUserId(version, userId).orElse(null);

        // Jeden użytkownik ma tylko jeden wpis. Gorsze podejście nie może
        // nadpisać jego istniejącego, najlepszego wyniku.
        boolean shouldStoreCandidate = previousBest == null || compareEntries(candidate, previousBest) < 0;
        if (shouldStoreCandidate) {
            if (previousBest != null) {
                // Aktualizacja istniejącego wpisu zachowuje jego identyfikator
                // i nie narusza ograniczenia: jeden użytkownik = jeden wpis
                // w danej wersji rankingu.
                previousBest.setScoreScaled(candidate.getScoreScaled());
                previousBest.setMaxScoreScaled(candidate.getMaxScoreScaled());
                previousBest.setDurationMs(candidate.getDurationMs());
                previousBest.setCompletedAt(candidate.getCompletedAt());
                rankingEntryRepository.save(previousBest);
            } else {
                entries.add(candidate);
                entries.sort(this::compareEntries);
                if (entries.size() <= 5 || entries.indexOf(candidate) < 5) {
                    rankingEntryRepository.save(candidate);
                }
            }
        }
        entries = rankingEntryRepository.findByRankingVersion(version); entries.sort(this::compareEntries);
        while(entries.size()>5) { rankingEntryRepository.delete(entries.remove(entries.size()-1)); }
        entries = rankingEntryRepository.findByRankingVersion(version); entries.sort(this::compareEntries);
        Integer position=null; for(int i=0;i<entries.size();i++) if(entries.get(i).getUserId().equals(userId)) position=i+1;
        return new RankingFinishDTO(scaled,max,duration,position,position==null,toEntryDtos(entries));
    }

    private QuestionCreateDTO toQuestionCreateDTO(Question question) {
        return new QuestionCreateDTO(
                question.getContent(),
                question.getAnswers().stream()
                        .map(answer -> new AnswerCreateDTO(answer.getContent(), answer.isCorrect(), answer.getPoints()))
                        .toList(),
                imageCompressor.toBase64(question.getImageData())
        );
    }

    private Quiz copyQuiz(Quiz sourceQuiz, List<Question> sourceQuestions, Long ownerUserId) {
        Quiz copiedQuiz = Quiz.builder()
                .title(sourceQuiz.getTitle())
                .ownerUserId(ownerUserId)
                .scoringMode(sourceQuiz.getScoringMode() == null ? ScoringMode.DEFAULT : sourceQuiz.getScoringMode())
                .allowNegativeScore(sourceQuiz.isAllowNegativeScore())
                .pointsPerCorrect(sourceQuiz.getPointsPerCorrect())
                .incorrectPenalty(sourceQuiz.getIncorrectPenalty())
                .penaltyMode(sourceQuiz.getPenaltyMode() == null ? PenaltyMode.FRACTION : sourceQuiz.getPenaltyMode())
                .randomQuestionOrder(sourceQuiz.isRandomQuestionOrder())
                .showCorrectAnswers(sourceQuiz.isShowCorrectAnswers())
                .build();

        sourceQuestions.forEach(sourceQuestion -> {
            Question copiedQuestion = Question.builder()
                    .content(sourceQuestion.getContent())
                    .imageFilename(sourceQuestion.getImageFilename())
                    .imageData(sourceQuestion.getImageData())
                    .build();

            sourceQuestion.getAnswers().forEach(sourceAnswer -> {
                Answer copiedAnswer = Answer.builder()
                        .content(sourceAnswer.getContent())
                        .correct(sourceAnswer.isCorrect())
                        .points(sourceAnswer.getPoints())
                        .build();
                copiedQuestion.addAnswer(copiedAnswer);
            });

            copiedQuiz.addQuestion(copiedQuestion);
        });

        return copiedQuiz;
    }

    private Quiz findQuizByShareCode(String rawCode) {
        String code = normalizeShareCode(rawCode);
        QuizShareCode shareCode = quizShareCodeRepository.findByCodeAndActiveTrue(code)
                .orElseThrow(() -> new EntityNotFoundException("Share code not found"));

        if (shareCode.getExpiresAt() != null && !shareCode.getExpiresAt().isAfter(LocalDateTime.now())) {
            throw new EntityNotFoundException("Share code expired");
        }

        return quizRepository.findWholeQuizByIdAndOwnerUserId(
                        shareCode.getQuiz().getId(),
                        shareCode.getCreatedByUserId()
                )
                .orElseThrow(() -> new EntityNotFoundException("Quiz not found"));
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
        if (rawCode == null) {
            throw new EntityNotFoundException("Share code not found");
        }

        String code = rawCode.replaceAll("[^A-Za-z0-9]", "").toUpperCase();

        if (code.length() != SHARE_CODE_LENGTH) {
            throw new EntityNotFoundException("Share code not found");
        }

        return code;
    }

    private QuizRankingVersion ensureRankingVersion(Quiz quiz, List<Question> questions) {
        QuizCreateDTO dto = toCreateDto(quiz, questions);
        String hash = rankingContentHash(dto);
        if (quiz.getRankingVersion() != null && hash.equals(quiz.getRankingVersion().getContentHash())) return quiz.getRankingVersion();
        try {
            QuizRankingVersion version = createRankingVersion(dto);
            quiz.setRankingVersion(version);
            return version;
        } catch (Exception exception) { throw new IllegalStateException("Nie udało się utworzyć wersji rankingowej.", exception); }
    }

    private QuizRankingVersion createRankingVersion(QuizCreateDTO dto) {
        try {
            return rankingVersionRepository.save(QuizRankingVersion.builder()
                    .snapshotJson(objectMapper.writeValueAsString(dto))
                    .contentHash(rankingContentHash(dto))
                    .build());
        } catch (Exception exception) {
            throw new IllegalStateException("Nie udało się utworzyć wersji rankingowej.", exception);
        }
    }

    private QuizRankingVersion findRankingVersionByShareCode(String rawCode) {
        String code = normalizeShareCode(rawCode);
        QuizShareCode shareCode = quizShareCodeRepository.findByCodeAndActiveTrue(code).orElseThrow(() -> new EntityNotFoundException("Share code not found"));
        if (shareCode.getExpiresAt() != null && !shareCode.getExpiresAt().isAfter(LocalDateTime.now())) throw new EntityNotFoundException("Share code expired");
        if (shareCode.getRankingVersion() != null) return shareCode.getRankingVersion();
        if (shareCode.getQuiz() == null) throw new EntityNotFoundException("Quiz not found");
        Quiz quiz = findWholeQuizByIdAndOwnerUserId(shareCode.getQuiz().getId(), shareCode.getCreatedByUserId());
        QuizRankingVersion version = ensureRankingVersion(quiz, quiz.getQuestions());
        shareCode.setRankingVersion(version);
        return version;
    }

    private QuizCreateDTO readSnapshot(QuizRankingVersion version) {
        try { return objectMapper.readValue(version.getSnapshotJson(), QuizCreateDTO.class); }
        catch (Exception exception) { throw new IllegalStateException("Uszkodzona wersja rankingowa.", exception); }
    }

    private QuizCreateDTO toCreateDto(Quiz quiz, List<Question> questions) {
        return new QuizCreateDTO(quiz.getTitle(), questions.stream().map(this::toQuestionCreateDTO).toList(), mapperDTO.toScoringDto(quiz), mapperDTO.toLimitsDto(quiz));
    }

    private String rankingContentHash(QuizCreateDTO dto) {
        try {
            ObjectNode root = objectMapper.createObjectNode();
            root.set("questions", objectMapper.valueToTree(dto.questions()));
            root.set("scoring", objectMapper.valueToTree(mapperDTO.normalizeScoring(dto.scoring())));
            byte[] bytes = objectMapper.writeValueAsBytes(root);
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
            StringBuilder result = new StringBuilder(); for(byte value:digest) result.append(String.format("%02x", value));
            return result.toString();
        } catch(Exception exception) { throw new IllegalStateException("Nie udało się porównać wersji quizu.", exception); }
    }

    private int compareEntries(QuizRankingEntry left, QuizRankingEntry right) {
        long a=(long)left.getScoreScaled()*right.getMaxScoreScaled(), b=(long)right.getScoreScaled()*left.getMaxScoreScaled();
        if(a!=b) return Long.compare(b,a);
        int duration=Long.compare(left.getDurationMs(),right.getDurationMs()); if(duration!=0)return duration;
        return left.getCompletedAt().compareTo(right.getCompletedAt());
    }

    private List<RankingEntryDTO> toEntryDtos(List<QuizRankingEntry> entries) {
        return java.util.stream.IntStream.range(0,entries.size()).mapToObj(index -> {
            QuizRankingEntry entry=entries.get(index);
            String name=rankingUserRepository.findById(entry.getUserId()).map(RankingUser::getUsername).orElse("Użytkownik");
            return new RankingEntryDTO(index+1,name,entry.getScoreScaled(),entry.getMaxScoreScaled(),entry.getDurationMs());
        }).toList();
    }

    private double maxQuestionScore(QuestionCreateDTO question, QuizScoringDTO scoring) {
        QuizScoringDTO normalized=mapperDTO.normalizeScoring(scoring);
        if("custom".equals(normalized.mode())) return question.answers().stream().filter(a->a.correct()).mapToDouble(a->a.points()==null?0:a.points()).sum();
        return normalized.pointsPerCorrect();
    }

    private double questionScore(QuestionCreateDTO question, List<Integer> indexes, QuizScoringDTO scoring) {
        QuizScoringDTO normalized=mapperDTO.normalizeScoring(scoring); List<AnswerCreateDTO> answers=question.answers();
        if("custom".equals(normalized.mode())) return answers.stream().filter(a->indexes.contains(answers.indexOf(a))).mapToDouble(a->a.points()==null?0:a.points()).sum();
        long correct=answers.stream().filter(AnswerCreateDTO::correct).count(), incorrect=answers.size()-correct;
        long selectedCorrect=indexes.stream().filter(i->i>=0&&i<answers.size()&&answers.get(i).correct()).count();
        long selectedIncorrect=indexes.stream().filter(i->i>=0&&i<answers.size()&&!answers.get(i).correct()).count();
        double value;
        if("fraction".equals(normalized.penaltyMode())) value=(correct==0?0:(double)selectedCorrect/correct)-(incorrect==0?0:(double)selectedIncorrect/incorrect);
        else if("percent".equals(normalized.penaltyMode())) value=selectedCorrect*normalized.pointsPerCorrect()*(1-(selectedIncorrect*normalized.incorrectPenalty()/100));
        else value=selectedCorrect*normalized.pointsPerCorrect()-selectedIncorrect*normalized.incorrectPenalty();
        return !normalized.allowNegativeScore() && value<0 ? 0 : value;
    }
}
