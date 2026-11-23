package net.edu.courser.quizservice.controller;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
import net.edu.courser.quizservice.dto.*;
import net.edu.courser.quizservice.entity.*;
import net.edu.courser.quizservice.service.QuizService;
import java.util.List;
import java.util.UUID;

/** X-User-Id from gateway after JWT validation. */
@RestController
@RequestMapping("/quizzes")
@RequiredArgsConstructor
public class QuizController {
    private final QuizService quizService;

    @GetMapping
    public List<QuizRawDTO> getAllQuizzes(@RequestHeader("X-User-Id") Long userId) {
        return quizService.listForOwner(userId);
    }

    @GetMapping("/{id}")
    public QuizPlayDTO getWholeQuiz(@PathVariable Long id, @RequestHeader("X-User-Id") Long userId) {
        return quizService.getQuizForPlay(id, userId);
    }

    @GetMapping("/{id}/export")
    public ResponseEntity<byte[]> exportQuiz(@PathVariable Long id, @RequestHeader("X-User-Id") Long userId) {
        QuizService.QuizArchive archive = quizService.exportQuizArchive(id, userId);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + sanitizeFilename(archive.title()) + ".zip\"")
                .header(HttpHeaders.CONTENT_TYPE, "application/zip")
                .body(archive.bytes());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteQuiz(@PathVariable Long id, @RequestHeader("X-User-Id") Long userId) {
        quizService.delete(id, userId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping
    public ResponseEntity<QuizRawDTO> createQuiz(@RequestHeader("X-User-Id") Long userId, @RequestBody QuizCreateDTO dto) {
        return created(quizService.create(dto, userId));
    }

    @PostMapping("/{id}/share-codes")
    public ResponseEntity<QuizShareCodeDTO> createShareCode(
            @PathVariable Long id,
            @RequestHeader("X-User-Id") Long userId,
            @RequestBody QuizShareCodeCreateDTO dto
    ) {
        QuizShareCode shareCode = quizService.createShareCode(id, userId, dto.expiresInSeconds());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(new QuizShareCodeDTO(formatShareCode(shareCode.getCode()), shareCode.getExpiresAt()));
    }

    @PostMapping("/import-code")
    public ResponseEntity<QuizRawDTO> importByCode(@RequestHeader("X-User-Id") Long userId, @RequestBody QuizImportByCodeDTO dto) {
        return created(quizService.importByShareCode(dto.code(), userId));
    }

    @PostMapping("/import-archive")
    public ResponseEntity<QuizRawDTO> importArchive(@RequestHeader("X-User-Id") Long userId, @RequestBody QuizArchiveImportDTO dto) {
        return created(quizService.importArchive(dto, userId));
    }

    /** Public guest preview for local store. */
    @PostMapping("/share-code-preview")
    public QuizShareCodePreviewDTO previewByCode(@RequestBody QuizImportByCodeDTO dto) {
        QuizRankingVersion version = quizService.findRankingVersionByShareCode(dto.code());
        return new QuizShareCodePreviewDTO(quizService.readSnapshot(version), version.getId().toString());
    }

    @PostMapping("/{id}/fork")
    public ResponseEntity<QuizRawDTO> forkQuiz(@PathVariable Long id, @RequestHeader("X-User-Id") Long userId) {
        return created(quizService.fork(id, userId));
    }

    @PostMapping("/{id}/ranking-attempts")
    public RankingAttemptStartDTO startRankingAttempt(
            @PathVariable Long id,
            @RequestHeader("X-User-Id") Long userId,
            @RequestBody RankingAttemptStartRequestDTO dto
    ) {
        return quizService.startRankingAttempt(id, userId, dto.clientSessionId());
    }

    @GetMapping("/{id}/ranking")
    public RankingLeaderboardDTO getRankingLeaderboard(@PathVariable Long id, @RequestHeader("X-User-Id") Long userId) {
        return quizService.getRankingLeaderboard(id, userId);
    }

    @PostMapping("/{id}/ranking-attempts/{attemptId}/finish")
    public RankingFinishDTO finishRankingAttempt(
            @PathVariable Long id,
            @PathVariable UUID attemptId,
            @RequestHeader("X-User-Id") Long userId,
            @RequestBody RankingFinishRequestDTO dto
    ) {
        return quizService.finishRankingAttempt(id, attemptId, userId, dto);
    }

    @PutMapping("/{id}")
    public QuizRawDTO updateQuiz(@PathVariable Long id, @RequestHeader("X-User-Id") Long userId, @RequestBody QuizCreateDTO dto) {
        return quizService.toRawDto(quizService.update(id, userId, dto));
    }

    @PatchMapping("/{id}")
    public QuizRawDTO updateQuizTitle(@PathVariable Long id, @RequestHeader("X-User-Id") Long userId, @RequestBody QuizEditTitleDTO dto) {
        return quizService.toRawDto(quizService.updateTitle(id, userId, dto));
    }

    private ResponseEntity<QuizRawDTO> created(Quiz quiz) {
        return ResponseEntity.status(HttpStatus.CREATED).body(quizService.toRawDto(quiz));
    }

    private String formatShareCode(String code) {
        return code.substring(0, 5) + "-" + code.substring(5);
    }

    private String sanitizeFilename(String title) {
        String sanitized = title.replaceAll("[^A-Za-z0-9._-]+", "_").replaceAll("^_+|_+$", "");
        return sanitized.isEmpty() ? "quiz" : sanitized;
    }
}
