package pl.ku1son.quizservice.service;
import pl.ku1son.quizservice.dto.*;
import pl.ku1son.quizservice.repository.QuestionRepository;
import pl.ku1son.quizservice.repository.QuizShareCodeRepository;
import pl.ku1son.quizservice.repository.QuizRepository;
import pl.ku1son.quizservice.entity.*;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import jakarta.persistence.EntityNotFoundException;

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

    public QuizService(
            QuizRepository quizRepository,
            QuestionRepository questionRepository,
            QuizShareCodeRepository quizShareCodeRepository,
            MapperDTO mapperDTO,
            ImageCompressor imageCompressor,
            QuizExportService quizExportService
    ) {
        this.quizRepository = quizRepository;
        this.questionRepository = questionRepository;
        this.quizShareCodeRepository = quizShareCodeRepository;
        this.mapperDTO = mapperDTO;
        this.imageCompressor = imageCompressor;
        this.quizExportService = quizExportService;
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

    @Transactional(readOnly = true)
    public byte[] exportQuizArchive(Long id, Long ownerUserId) {
        Quiz quiz = findByIdAndOwnerUserId(id, ownerUserId);
        List<Question> questions = questionRepository.findWholeByQuizId(quiz.getId());
        return quizExportService.exportAsZip(quiz, questions);
    }

    public List<Question> findWholeQuestionsByQuizId(Long quizId) {
        return questionRepository.findWholeByQuizId(quizId);
    }

    public Quiz save(Quiz quiz) {
        return quizRepository.save(quiz);
    }

    public void delete(Quiz quiz) {
        quizRepository.delete(quiz);
    }

    @Transactional
    public QuizShareCode createShareCode(Long quizId, Long ownerUserId, Long expiresInSeconds) {
        Quiz quiz = findByIdAndOwnerUserId(quizId, ownerUserId);
        LocalDateTime expiresAt = expiresInSeconds == null ? null : LocalDateTime.now().plusSeconds(expiresInSeconds);

        QuizShareCode shareCode = QuizShareCode.builder()
                .quiz(quiz)
                .code(generateUniqueShareCode())
                .createdByUserId(ownerUserId)
                .expiresAt(expiresAt)
                .build();

        return quizShareCodeRepository.save(shareCode);
    }

    @Transactional
    public Quiz importByShareCode(String rawCode, Long ownerUserId) {
        Quiz sourceQuiz = findQuizByShareCode(rawCode);
        List<Question> sourceQuestions = questionRepository.findWholeByQuizId(sourceQuiz.getId());
        Quiz copiedQuiz = copyQuiz(sourceQuiz, sourceQuestions, ownerUserId);

        return quizRepository.save(copiedQuiz);
    }

    @Transactional(readOnly = true)
    public QuizCreateDTO getCreateDtoByShareCode(String rawCode) {
        Quiz sourceQuiz = findQuizByShareCode(rawCode);
        List<Question> sourceQuestions = questionRepository.findWholeByQuizId(sourceQuiz.getId());

        return new QuizCreateDTO(
                sourceQuiz.getTitle(),
                sourceQuestions.stream()
                        .map(this::toQuestionCreateDTO)
                        .toList()
        );
    }

    @Transactional
    public Quiz update(Long id, Long ownerUserId, QuizCreateDTO dto) {
        Quiz quiz = quizRepository.findByIdAndOwnerUserId(id, ownerUserId)
                .orElseThrow(() -> new EntityNotFoundException("Quiz not found"));
        quiz.setTitle(dto.title());
        quiz.getQuestions().clear();
        for (int index = 0; index < dto.questions().size(); index++) {
            quiz.addQuestion(mapperDTO.toQuestionEntity(dto.questions().get(index), index));
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

    private QuestionCreateDTO toQuestionCreateDTO(Question question) {
        return new QuestionCreateDTO(
                question.getContent(),
                question.getAnswers().stream()
                        .map(answer -> new AnswerCreateDTO(answer.getContent(), answer.isCorrect()))
                        .toList(),
                imageCompressor.toBase64(question.getImageData())
        );
    }

    private Quiz copyQuiz(Quiz sourceQuiz, List<Question> sourceQuestions, Long ownerUserId) {
        Quiz copiedQuiz = Quiz.builder()
                .title(sourceQuiz.getTitle())
                .ownerUserId(ownerUserId)
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
}
