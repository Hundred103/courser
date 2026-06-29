package pl.ku1son.quizservice.controller;
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
    public List<QuizRawDTO> getAllQuizzes() {
        return quizService.findAll()
                .stream()
                .map(mapperDTO::toQuizRawDTO)
                .toList();
    }

    //GET /quizzes/id -> pojedynczy quiz z pytaniami i odpowiedziami
    @GetMapping("/{id}")
    public QuizPlayDTO getWholeQuiz(@PathVariable Long id) {
        Quiz quiz = quizService.findWholeQuizById(id);
        return mapperDTO.toQuizPlayDTO(quiz);
    }

    //GET /quizzes/id/raw -> pojedynczy quiz bez zaciagania pytan i odpowiedzi
    //                    -> (np. zeby wyswietic tylko tytul albo w przyszlosci inne dane - moze sie przydac)
    @GetMapping("/{id}/raw")
    public QuizRawDTO getRawQuiz(@PathVariable Long id) {
        Quiz quiz = quizService.findById(id);
        return mapperDTO.toQuizRawDTO(quiz);
    }

    //DELETE /quizzes/id
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteQuiz(@PathVariable Long id) {
        Quiz quiz = quizService.findById(id);
        quizService.delete(quiz);
        return ResponseEntity.noContent().build();
    }

    //POST /quizzes
    @PostMapping //RequestBody samo zamienia z json na to co chcemy
    public ResponseEntity<QuizRawDTO> createQuiz(@RequestBody QuizCreateDTO dto) {
        Quiz quiz = mapperDTO.toQuizEntity(dto);
        Quiz saved = quizService.save(quiz);
        return ResponseEntity
                .status(HttpStatus.CREATED) //201
                .body(mapperDTO.toQuizRawDTO(saved));
    }

    //PUT /quizzes/id -> zmienia caly quiz wraz z pytaniami i odpowiedziami
    //                -> (mozliwosc edycji pytan i odpowiedzi quizu)
    @PutMapping("/{id}")
    public ResponseEntity<QuizRawDTO> updateQuiz(@PathVariable Long id, @RequestBody QuizCreateDTO dto) {
        Quiz updated = quizService.update(id, dto);
        return ResponseEntity.ok(
                mapperDTO.toQuizRawDTO(updated)
        );
    }

    //PATCH /quizzes/id -> zmienia tylko quiz bez zmieniania pytan i odpowiedzi
    //                  -> np. guzik przy liscie quizow by zmienic tytul
    //                  -> (obecnie jest tylko tytul w przyszlosc mozna dodac inne pola)
    @PatchMapping("/{id}")
    public ResponseEntity<QuizRawDTO> updateQuizTitle(@PathVariable Long id, @RequestBody QuizEditTitleDTO dto) {
        Quiz updated = quizService.updateTitle(id, dto);
        return ResponseEntity.ok(
                mapperDTO.toQuizRawDTO(updated)
        );
    }
}
