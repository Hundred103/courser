package net.edu.courser.quizservice.service;

import lombok.RequiredArgsConstructor;
import net.edu.courser.quizservice.dto.AnswerCreateDTO;
import net.edu.courser.quizservice.dto.MapperDTO;
import net.edu.courser.quizservice.dto.QuestionCreateDTO;
import net.edu.courser.quizservice.dto.QuizArchiveDTO;
import org.springframework.stereotype.Service;
import net.edu.courser.quizservice.entity.Question;
import net.edu.courser.quizservice.entity.Quiz;
import tools.jackson.databind.ObjectMapper;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;
import java.util.stream.IntStream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

@Service
@RequiredArgsConstructor
public class QuizExportService {
    private static final String QUIZ_JSON = "quiz.json";

    private final ObjectMapper objectMapper;
    private final MediaStorageService mediaStorageService;
    private final MapperDTO mapperDTO;

    public byte[] exportAsZip(Quiz quiz, List<Question> questions, String rankingVersionId) {
        QuizArchiveDTO archive = new QuizArchiveDTO(
                quiz.getTitle(),
                mapperDTO.toScoringDto(quiz),
                mapperDTO.toLimitsDto(quiz),
                new QuizArchiveDTO.RankingReference(rankingVersionId),
                IntStream.range(0, questions.size()).mapToObj(index -> toArchiveQuestion(questions.get(index), index)).toList()
        );

        try (ByteArrayOutputStream bytes = new ByteArrayOutputStream();
             ZipOutputStream zip = new ZipOutputStream(bytes)) {
            zip.putNextEntry(new ZipEntry(QUIZ_JSON));
            zip.write(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(archive));
            zip.closeEntry();

            for (int index = 0; index < questions.size(); index++) {
                Question question = questions.get(index);
                if (!hasImage(question)) continue;
                zip.putNextEntry(new ZipEntry("images/" + exportFilename(question, index)));
                zip.write(mediaStorageService.read(question.getImageKey()));
                zip.closeEntry();
            }

            zip.finish();
            return bytes.toByteArray();
        } catch (IOException exception) {
            throw new IllegalStateException("Could not export quiz", exception);
        }
    }

    private QuestionCreateDTO toArchiveQuestion(Question question, int index) {
        return new QuestionCreateDTO(
                question.getContent(),
                question.getAnswers().stream()
                        .map(answer -> new AnswerCreateDTO(answer.getContent(), answer.isCorrect(), answer.getPoints()))
                        .toList(),
                hasImage(question) ? exportFilename(question, index) : null
        );
    }

    private static boolean hasImage(Question question) {
        return question.getImageKey() != null && !question.getImageKey().isBlank();
    }

    /** imageN.ext by question index (shared keys must stay unique in ZIP). */
    private static String exportFilename(Question question, int index) {
        String key = question.getImageKey();
        return "image" + (index + 1) + key.substring(key.lastIndexOf('.'));
    }
}
