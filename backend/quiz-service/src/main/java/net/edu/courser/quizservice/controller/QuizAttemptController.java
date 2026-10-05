package net.edu.courser.quizservice.controller;

import net.edu.courser.quizservice.dto.AttemptStateResponse;
import net.edu.courser.quizservice.dto.AttemptVerdictResponse;
import net.edu.courser.quizservice.dto.QuizLimitsDTO;
import net.edu.courser.quizservice.dto.QuizStartInfoDTO;
import net.edu.courser.quizservice.dto.SubmitAnswersRequest;
import net.edu.courser.quizservice.service.QuizAttemptService;
import net.edu.courser.quizservice.service.QuizService;
import org.springframework.web.bind.annotation.*;

@RestController
public class QuizAttemptController {
    private final QuizAttemptService quizAttemptService;
    private final QuizService quizService;

    public QuizAttemptController(QuizAttemptService quizAttemptService, QuizService quizService) {
        this.quizAttemptService = quizAttemptService;
        this.quizService = quizService;
    }

    @GetMapping("/quizzes/{quizId}/start-info")
    public QuizStartInfoDTO startInfo(@PathVariable Long quizId, @RequestHeader("X-User-Id") Long userId) {
        return quizAttemptService.startInfo(quizId, userId);
    }

    @PostMapping("/quizzes/{quizId}/attempts")
    public AttemptStateResponse start(
            @PathVariable Long quizId,
            @RequestHeader("X-User-Id") Long userId,
            @RequestParam(required = false) Long questionId
    ) {
        return quizAttemptService.startOrResume(quizId, userId, questionId);
    }

    @GetMapping("/quizzes/{quizId}/attempts/{attemptId}")
    public AttemptStateResponse state(
            @PathVariable Long quizId,
            @PathVariable Long attemptId,
            @RequestHeader("X-User-Id") Long userId,
            @RequestParam(required = false) Long questionId
    ) {
        return quizAttemptService.stateFor(quizId, attemptId, questionId, userId);
    }

    @PostMapping("/quizzes/{quizId}/attempts/{attemptId}/questions/{questionId}/open")
    public AttemptStateResponse openQuestion(
            @PathVariable Long quizId,
            @PathVariable Long attemptId,
            @PathVariable Long questionId,
            @RequestHeader("X-User-Id") Long userId
    ) {
        return quizAttemptService.openQuestion(quizId, attemptId, questionId, userId);
    }

    // QUIZ_ANSWERS_IN: player answer ids arrive here
    @PostMapping("/quizzes/{quizId}/attempts/{attemptId}/questions/{questionId}/submit")
    public AttemptStateResponse submitQuestion(
            @PathVariable Long quizId,
            @PathVariable Long attemptId,
            @PathVariable Long questionId,
            @RequestHeader("X-User-Id") Long userId,
            @RequestBody SubmitAnswersRequest request
    ) {
        return quizAttemptService.submitQuestion(
                quizId,
                attemptId,
                questionId,
                userId,
                request == null ? null : request.answerIds()
        );
    }

    @PostMapping("/quizzes/{quizId}/attempts/{attemptId}/finish")
    public AttemptVerdictResponse finish(
            @PathVariable Long quizId,
            @PathVariable Long attemptId,
            @RequestHeader("X-User-Id") Long userId
    ) {
        return quizAttemptService.finish(quizId, attemptId, userId);
    }

    @GetMapping("/internal/quizzes/{quizId}/limits")
    public QuizLimitsDTO limits(@PathVariable Long quizId) {
        return quizService.limitsForQuiz(quizId);
    }

    @GetMapping("/internal/attempts/{attemptId}")
    public AttemptVerdictResponse verdict(@PathVariable Long attemptId, @RequestParam Long userId) {
        return quizAttemptService.verdict(attemptId, userId);
    }
}
