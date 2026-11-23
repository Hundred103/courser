package net.edu.courser.quizservice.service;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import net.edu.courser.quizservice.dto.MapperDTO;
import net.edu.courser.quizservice.entity.Answer;
import net.edu.courser.quizservice.entity.PenaltyMode;
import net.edu.courser.quizservice.entity.Question;
import net.edu.courser.quizservice.entity.Quiz;
import net.edu.courser.quizservice.entity.ScoringMode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.ByteArrayInputStream;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import static org.assertj.core.api.Assertions.assertThat;

class QuizExportServiceTest {
    @TempDir
    Path storage;

    @Test
    void exportsEveryQuizParameterAndOneFilePerQuestionImage() throws Exception {
        MediaStorageService media = new MediaStorageService(storage.toString(), "/media");
        ObjectMapper objectMapper = JsonMapper.builder().build();
        String sharedKey = media.store(MediaStorageServiceTest.png(1));
        Quiz quiz = Quiz.builder()
                .title("Stolice")
                .scoringMode(ScoringMode.CUSTOM)
                .allowNegativeScore(true)
                .pointsPerCorrect(2)
                .incorrectPenalty(25)
                .penaltyMode(PenaltyMode.PERCENT)
                .randomQuestionOrder(true)
                .showCorrectAnswers(false)
                .build();
        List<Question> questions = List.of(
                question("Stolica Polski?", sharedKey, "Warszawa", 2.5),
                question("Stolica Czech?", sharedKey, "Praga", 1.0)
        );

        Map<String, byte[]> entries = unzip(new QuizExportService(objectMapper, media, new MapperDTO(media))
                .exportAsZip(quiz, questions, "version-id"));

        assertThat(entries).containsOnlyKeys("quiz.json", "images/image1.png", "images/image2.png");
        JsonNode json = objectMapper.readTree(entries.get("quiz.json"));
        assertThat(json.path("title").asText()).isEqualTo("Stolice");
        assertThat(json.path("scoring").path("mode").asText()).isEqualTo("custom");
        assertThat(json.path("scoring").path("allowNegativeScore").asBoolean()).isTrue();
        assertThat(json.path("scoring").path("pointsPerCorrect").asDouble()).isEqualTo(2);
        assertThat(json.path("scoring").path("incorrectPenalty").asDouble()).isEqualTo(25);
        assertThat(json.path("scoring").path("penaltyMode").asText()).isEqualTo("percent");
        assertThat(json.path("limits").path("randomQuestionOrder").asBoolean()).isTrue();
        assertThat(json.path("limits").path("showCorrectAnswers").asBoolean()).isFalse();
        assertThat(json.path("_ranking").path("versionId").asText()).isEqualTo("version-id");
        assertThat(json.path("_ranking").has("contentHash")).isFalse();
        JsonNode first = json.path("questions").get(0);
        assertThat(first.path("content").asText()).isEqualTo("Stolica Polski?");
        assertThat(first.path("image").asText()).isEqualTo("image1.png");
        assertThat(first.path("answers").get(0).path("content").asText()).isEqualTo("Warszawa");
        assertThat(first.path("answers").get(0).path("correct").asBoolean()).isTrue();
        assertThat(first.path("answers").get(0).path("points").asDouble()).isEqualTo(2.5);
        assertThat(json.path("questions").get(1).path("image").asText()).isEqualTo("image2.png");
    }

    private static Question question(String content, String imageKey, String answer, double points) {
        Question question = Question.builder().content(content).imageKey(imageKey).build();
        question.addAnswer(Answer.builder().content(answer).correct(true).points(points).build());
        return question;
    }

    private static Map<String, byte[]> unzip(byte[] archive) throws Exception {
        Map<String, byte[]> entries = new LinkedHashMap<>();
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(archive))) {
            for (ZipEntry entry = zip.getNextEntry(); entry != null; entry = zip.getNextEntry()) {
                entries.put(entry.getName(), zip.readAllBytes());
            }
        }
        return entries;
    }
}
