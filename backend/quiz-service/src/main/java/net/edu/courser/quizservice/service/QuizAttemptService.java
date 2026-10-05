package net.edu.courser.quizservice.service;

import jakarta.persistence.EntityNotFoundException;
import net.edu.courser.quizservice.config.QuizTimerSettings;
import net.edu.courser.quizservice.dto.AttemptStateResponse;
import net.edu.courser.quizservice.dto.AttemptVerdictResponse;
import net.edu.courser.quizservice.dto.QuizStartInfoDTO;
import net.edu.courser.quizservice.entity.AttemptStatus;
import net.edu.courser.quizservice.entity.Quiz;
import net.edu.courser.quizservice.entity.QuizAttempt;
import net.edu.courser.quizservice.entity.QuizAttemptQuestion;
import net.edu.courser.quizservice.exception.AttemptLimitException;
import net.edu.courser.quizservice.exception.QuizCheatingException;
import net.edu.courser.quizservice.repository.QuizAttemptRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.EnumSet;
import java.util.List;

@Service
public class QuizAttemptService {
    private static final EnumSet<AttemptStatus> USED_ATTEMPTS = EnumSet.of(
            AttemptStatus.COMPLETED,
            AttemptStatus.EXPIRED,
            AttemptStatus.CHEATING
    );

    private final QuizAttemptRepository quizAttemptRepository;
    private final QuizService quizService;
    private final QuizTimerSettings timerSettings;

    public QuizAttemptService(
            QuizAttemptRepository quizAttemptRepository,
            QuizService quizService,
            QuizTimerSettings timerSettings
    ) {
        this.quizAttemptRepository = quizAttemptRepository;
        this.quizService = quizService;
        this.timerSettings = timerSettings;
    }

    @Transactional(readOnly = true)
    public QuizStartInfoDTO startInfo(Long quizId, Long userId) {
        Quiz quiz = quizService.findWholeQuizByIdAndOwnerUserId(quizId, userId);
        return new QuizStartInfoDTO(
                quiz.getId(),
                quiz.getTitle(),
                quiz.getQuestions().size(),
                quiz.getQuizTimeSeconds(),
                quiz.getQuestionTimeSeconds(),
                quiz.getMaxAttempts(),
                usedAttempts(originOf(quiz), userId)
        );
    }

    @Transactional
    public AttemptStateResponse startOrResume(Long quizId, Long userId, Long questionId) {
        Quiz quiz = quizService.findWholeQuizByIdAndOwnerUserId(quizId, userId);
        LocalDateTime now = LocalDateTime.now();
        Long originQuizId = originOf(quiz);
        QuizAttempt attempt = null;

        for (QuizAttempt existing : quizAttemptRepository.findByOriginQuizIdAndUserIdAndStatus(
                originQuizId,
                userId,
                AttemptStatus.IN_PROGRESS
        )) {
            boolean sameCopy = quizId.equals(existing.getQuizId());
            if (sameCopy && !isPastGrace(existing.getQuizDeadlineAt(), now)) {
                attempt = existing;
                continue;
            }

            close(existing, AttemptStatus.EXPIRED, now);
            quizAttemptRepository.saveAndFlush(existing);
        }

        if (attempt == null) {
            long used = usedAttempts(originQuizId, userId);
            if (quiz.getMaxAttempts() != null && used >= quiz.getMaxAttempts()) {
                throw new AttemptLimitException();
            }

            attempt = QuizAttempt.builder()
                    .quizId(quizId)
                    .originQuizId(originQuizId)
                    .userId(userId)
                    .startedAt(now)
                    .quizDeadlineAt(deadline(now, quiz.getQuizTimeSeconds()))
                    .status(AttemptStatus.IN_PROGRESS)
                    .build();
            attempt = quizAttemptRepository.save(attempt);
        }

        return state(attempt, quiz, questionId, now);
    }

    @Transactional
    public AttemptStateResponse openQuestion(Long quizId, Long attemptId, Long questionId, Long userId) {
        Quiz quiz = quizService.findWholeQuizByIdAndOwnerUserId(quizId, userId);
        QuizAttempt attempt = lockedAttempt(quizId, attemptId, userId);
        LocalDateTime now = LocalDateTime.now();
        ensureQuestionBelongsToQuiz(quiz, questionId);
        rejectIfPastGrace(attempt.getQuizDeadlineAt(), now);

        QuizAttemptQuestion question = findQuestion(attempt, questionId);
        if (question == null) {
            question = QuizAttemptQuestion.builder()
                    .questionId(questionId)
                    .startedAt(now)
                    .deadlineAt(questionDeadline(now, quiz, attempt))
                    .build();
            attempt.addQuestion(question);
            quizAttemptRepository.save(attempt);
        }

        return state(attempt, quiz, questionId, now);
    }

    @Transactional(readOnly = true)
    public AttemptStateResponse stateFor(Long quizId, Long attemptId, Long questionId, Long userId) {
        Quiz quiz = quizService.findWholeQuizByIdAndOwnerUserId(quizId, userId);
        QuizAttempt attempt = lockedAttempt(quizId, attemptId, userId);
        return state(attempt, quiz, questionId, LocalDateTime.now());
    }

    @Transactional
    public AttemptStateResponse submitQuestion(Long quizId, Long attemptId, Long questionId, Long userId, List<Long> answerIds) {
        Quiz quiz = quizService.findWholeQuizByIdAndOwnerUserId(quizId, userId);
        QuizAttempt attempt = lockedAttempt(quizId, attemptId, userId);
        LocalDateTime now = LocalDateTime.now();
        ensureQuestionBelongsToQuiz(quiz, questionId);

        if (attempt.getStatus() == AttemptStatus.CHEATING) {
            throw new QuizCheatingException();
        }

        if (attempt.getStatus() != AttemptStatus.IN_PROGRESS) {
            throw new IllegalArgumentException("To podejście jest już zamknięte.");
        }

        try {
            rejectIfPastGrace(attempt.getQuizDeadlineAt(), now);
        } catch (QuizCheatingException exception) {
            close(attempt, AttemptStatus.CHEATING, now);
            throw exception;
        }

        QuizAttemptQuestion question = findQuestion(attempt, questionId);
        if (question == null) {
            throw new IllegalArgumentException("Pytanie nie zostało rozpoczęte.");
        }

        if (question.getSubmittedAt() != null) {
            return state(attempt, quiz, questionId, now);
        }

        try {
            rejectIfPastGrace(question.getDeadlineAt(), now);
        } catch (QuizCheatingException exception) {
            close(attempt, AttemptStatus.CHEATING, now);
            throw exception;
        }

        question.setSubmittedAt(now);
        // QUIZ_ANSWERS_IN: store the received answer ids
        question.setSelectedAnswerIds(joinAnswerIds(answerIds));
        return state(attempt, quiz, questionId, now);
    }

    @Transactional
    public AttemptVerdictResponse finish(Long quizId, Long attemptId, Long userId) {
        Quiz quiz = quizService.findWholeQuizByIdAndOwnerUserId(quizId, userId);
        QuizAttempt attempt = lockedAttempt(quizId, attemptId, userId);
        LocalDateTime now = LocalDateTime.now();

        if (attempt.getStatus() == AttemptStatus.COMPLETED) {
            return verdict(attempt);
        }

        if (attempt.getStatus() == AttemptStatus.CHEATING) {
            throw new QuizCheatingException();
        }

        try {
            rejectIfPastGrace(attempt.getQuizDeadlineAt(), now);
        } catch (QuizCheatingException exception) {
            close(attempt, AttemptStatus.CHEATING, now);
            throw exception;
        }

        close(attempt, AttemptStatus.COMPLETED, now);
        return verdict(attempt);
    }

    @Transactional(readOnly = true)
    public AttemptVerdictResponse verdict(Long attemptId, Long userId) {
        QuizAttempt attempt = quizAttemptRepository.findById(attemptId)
                .orElseThrow(() -> new EntityNotFoundException("Próba nie istnieje"));

        if (!attempt.getUserId().equals(userId)) {
            throw new EntityNotFoundException("Próba nie istnieje");
        }

        return verdict(attempt);
    }

    public int usedAttempts(Long originQuizId, Long userId) {
        return (int) quizAttemptRepository.countByOriginQuizIdAndUserIdAndStatusIn(originQuizId, userId, USED_ATTEMPTS);
    }

    public static Long originOf(Quiz quiz) {
        return quiz.getOriginQuizId() != null ? quiz.getOriginQuizId() : quiz.getId();
    }

    private AttemptVerdictResponse verdict(QuizAttempt attempt) {
        return new AttemptVerdictResponse(attempt.getStatus().name(), attempt.getQuizId(), attempt.getUserId());
    }

    private AttemptStateResponse state(QuizAttempt attempt, Quiz quiz, Long questionId, LocalDateTime now) {
        QuizAttemptQuestion question = questionId == null ? null : findQuestion(attempt, questionId);
        long used = usedAttempts(originOf(quiz), attempt.getUserId());
        boolean quizExpired = isExpired(attempt.getQuizDeadlineAt(), now);
        boolean questionExpired = question != null && isExpired(question.getDeadlineAt(), now);
        Long quizRemaining = remainingMillis(attempt.getQuizDeadlineAt(), now);
        Long questionRemaining = question == null ? null : remainingMillis(question.getDeadlineAt(), now);

        return new AttemptStateResponse(
                attempt.getId(),
                quiz.getMaxAttempts(),
                (int) used,
                quizRemaining,
                questionRemaining,
                isEndingSoon(quizRemaining),
                isEndingSoon(questionRemaining),
                quizExpired,
                questionExpired,
                timerSettings.getEndingWarningSeconds()
        );
    }

    private QuizAttempt lockedAttempt(Long quizId, Long attemptId, Long userId) {
        QuizAttempt attempt = quizAttemptRepository.findById(attemptId)
                .orElseThrow(() -> new EntityNotFoundException("Próba nie istnieje"));

        if (!attempt.getQuizId().equals(quizId) || !attempt.getUserId().equals(userId)) {
            throw new EntityNotFoundException("Próba nie istnieje");
        }

        return attempt;
    }

    private void ensureQuestionBelongsToQuiz(Quiz quiz, Long questionId) {
        boolean belongs = quiz.getQuestions().stream().anyMatch(question -> question.getId().equals(questionId));
        if (!belongs) {
            throw new EntityNotFoundException("Pytanie nie istnieje");
        }
    }

    private QuizAttemptQuestion findQuestion(QuizAttempt attempt, Long questionId) {
        return attempt.getQuestions().stream()
                .filter(question -> question.getQuestionId().equals(questionId))
                .findFirst()
                .orElse(null);
    }

    private LocalDateTime questionDeadline(LocalDateTime now, Quiz quiz, QuizAttempt attempt) {
        LocalDateTime deadline = deadline(now, quiz.getQuestionTimeSeconds());

        if (deadline != null && attempt.getQuizDeadlineAt() != null && deadline.isAfter(attempt.getQuizDeadlineAt())) {
            return attempt.getQuizDeadlineAt();
        }

        return deadline;
    }

    private LocalDateTime deadline(LocalDateTime now, Integer seconds) {
        if (seconds == null) {
            return null;
        }

        return now.plusSeconds(seconds);
    }

    private void rejectIfPastGrace(LocalDateTime deadline, LocalDateTime now) {
        if (isPastGrace(deadline, now)) {
            throw new QuizCheatingException();
        }
    }

    private boolean isPastGrace(LocalDateTime deadline, LocalDateTime now) {
        return deadline != null && now.isAfter(deadline.plusSeconds(timerSettings.getSubmissionGraceSeconds()));
    }

    private boolean isExpired(LocalDateTime deadline, LocalDateTime now) {
        return deadline != null && !now.isBefore(deadline);
    }

    private Long remainingMillis(LocalDateTime deadline, LocalDateTime now) {
        if (deadline == null) {
            return null;
        }

        return Math.max(0, Duration.between(now, deadline).toMillis());
    }

    private boolean isEndingSoon(Long remainingMillis) {
        if (remainingMillis == null) {
            return false;
        }

        long warningMillis = timerSettings.getEndingWarningSeconds() * 1000L;
        return remainingMillis > 0 && remainingMillis <= warningMillis;
    }

    private void close(QuizAttempt attempt, AttemptStatus status, LocalDateTime now) {
        attempt.setStatus(status);
        attempt.setCompletedAt(now);
    }

    private String joinAnswerIds(List<Long> answerIds) {
        if (answerIds == null || answerIds.isEmpty()) {
            return "";
        }

        StringBuilder joined = new StringBuilder();
        for (Long answerId : answerIds) {
            if (answerId == null) {
                continue;
            }

            if (!joined.isEmpty()) {
                joined.append(',');
            }

            joined.append(answerId);
        }

        return joined.toString();
    }
}
