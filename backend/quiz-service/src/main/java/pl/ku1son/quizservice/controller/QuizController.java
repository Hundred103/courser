package pl.ku1son.quizservice.controller;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
import pl.ku1son.quizservice.dto.*;
import pl.ku1son.quizservice.entity.*;
import pl.ku1son.quizservice.service.QuizService;
import java.util.List;



@RestController
@RequestMapping("/quizzes")
public class QuizController {
    private final QuizService quizService;
    private final MapperDTO mapperDTO;

    public QuizController(QuizService quizService, MapperDTO mapperDTO) {
        this.quizService = quizService;
        this.mapperDTO = mapperDTO;
    }

    //GET /quizzes -> lista quizow
    @GetMapping  //domyslnie 200 OK
    public List<QuizRawDTO> getAllQuizzes(@RequestHeader("X-User-Id") Long userId) {
        return quizService.findAllByOwnerUserId(userId)
                .stream()
                .map(mapperDTO::toQuizRawDTO)
                .toList();
    }

    //GET /quizzes/id -> pojedynczy quiz z pytaniami i odpowiedziami
    @GetMapping("/{id}")
    public QuizPlayDTO getWholeQuiz(@PathVariable Long id, @RequestHeader("X-User-Id") Long userId) {
        return quizService.getQuizForPlay(id, userId);
    }

    //GET /quizzes/id/raw -> pojedynczy quiz bez zaciagania pytan i odpowiedzi
    //                    -> (np. zeby wyswietic tylko tytul albo w przyszlosci inne dane - moze sie przydac)
    @GetMapping("/{id}/raw")
    public QuizRawDTO getRawQuiz(@PathVariable Long id, @RequestHeader("X-User-Id") Long userId) {
        Quiz quiz = quizService.findByIdAndOwnerUserId(id, userId);
        return mapperDTO.toQuizRawDTO(quiz);
    }

    @GetMapping("/{id}/export")
    public ResponseEntity<byte[]> exportQuiz(@PathVariable Long id, @RequestHeader("X-User-Id") Long userId) {
        Quiz quiz = quizService.findByIdAndOwnerUserId(id, userId);
        byte[] archive = quizService.exportQuizArchive(id, userId);
        String filename = sanitizeFilename(quiz.getTitle()) + ".zip";

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .header(HttpHeaders.CONTENT_TYPE, "application/zip")
                .body(archive);
    }

    //DELETE /quizzes/id
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteQuiz(@PathVariable Long id, @RequestHeader("X-User-Id") Long userId) {
        Quiz quiz = quizService.findByIdAndOwnerUserId(id, userId);
        quizService.delete(quiz);
        return ResponseEntity.noContent().build();
    }

    //POST /quizzes
    @PostMapping //RequestBody samo zamienia z json na to co chcemy
    public ResponseEntity<QuizRawDTO> createQuiz(@RequestHeader("X-User-Id") Long userId, @RequestBody QuizCreateDTO dto) {
        Quiz quiz = mapperDTO.toQuizEntity(dto);
        quiz.setOwnerUserId(userId);
        Quiz saved = quizService.save(quiz);
        return ResponseEntity
                .status(HttpStatus.CREATED) //201
                .body(mapperDTO.toQuizRawDTO(saved));
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
    public ResponseEntity<QuizRawDTO> importByCode(
            @RequestHeader("X-User-Id") Long userId,
            @RequestBody QuizImportByCodeDTO dto
    ) {
        Quiz importedQuiz = quizService.importByShareCode(dto.code(), userId);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(mapperDTO.toQuizRawDTO(importedQuiz));
    }

    @PostMapping("/share-code-preview")
    public QuizCreateDTO previewByCode(@RequestBody QuizImportByCodeDTO dto) {
        return quizService.getCreateDtoByShareCode(dto.code());
    }

    //PUT /quizzes/id -> zmienia caly quiz wraz z pytaniami i odpowiedziami
    //                -> (mozliwosc edycji pytan i odpowiedzi quizu)
    @PutMapping("/{id}")
    public ResponseEntity<QuizRawDTO> updateQuiz(
            @PathVariable Long id,
            @RequestHeader("X-User-Id") Long userId,
            @RequestBody QuizCreateDTO dto
    ) {
        Quiz updated = quizService.update(id, userId, dto);
        return ResponseEntity.ok(
                mapperDTO.toQuizRawDTO(updated)
        );
    }

    //PATCH /quizzes/id -> zmienia tylko quiz bez zmieniania pytan i odpowiedzi
    //                  -> np. guzik przy liscie quizow by zmienic tytul
    //                  -> (obecnie jest tylko tytul w przyszlosc mozna dodac inne pola)
    @PatchMapping("/{id}")
    public ResponseEntity<QuizRawDTO> updateQuizTitle(
            @PathVariable Long id,
            @RequestHeader("X-User-Id") Long userId,
            @RequestBody QuizEditTitleDTO dto
    ) {
        Quiz updated = quizService.updateTitle(id, userId, dto);
        return ResponseEntity.ok(
                mapperDTO.toQuizRawDTO(updated)
        );
    }

    private String formatShareCode(String code) {
        return code.substring(0, 5) + "-" + code.substring(5);
    }

    private String sanitizeFilename(String title) {
        String sanitized = title.replaceAll("[^A-Za-z0-9._-]+", "_").replaceAll("^_+|_+$", "");
        return sanitized.isEmpty() ? "quiz" : sanitized;
    }
}
