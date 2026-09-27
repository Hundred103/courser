package net.edu.courser.quizservice.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;
import net.edu.courser.quizservice.entity.PenaltyMode;
import net.edu.courser.quizservice.entity.Question;
import net.edu.courser.quizservice.entity.Quiz;
import net.edu.courser.quizservice.entity.ScoringMode;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

@Service
public class QuizExportService {
    private static final String QUIZ_JSON = "quiz.json";

    private final ObjectMapper objectMapper;

    public QuizExportService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    private ObjectNode scoringNode(Quiz quiz) {
        ScoringMode mode = quiz.getScoringMode() == null ? ScoringMode.DEFAULT : quiz.getScoringMode();
        PenaltyMode penaltyMode = quiz.getPenaltyMode() == null ? PenaltyMode.FRACTION : quiz.getPenaltyMode();
        ObjectNode scoring = objectMapper.createObjectNode();
        scoring.put("mode", mode.name().toLowerCase());
        scoring.put("allowNegativeScore", quiz.isAllowNegativeScore());
        scoring.put("pointsPerCorrect", quiz.getPointsPerCorrect());
        scoring.put("incorrectPenalty", quiz.getIncorrectPenalty());
        scoring.put("penaltyMode", penaltyMode.name().toLowerCase());
        return scoring;
    }

    public byte[] exportAsZip(Quiz quiz, List<Question> questions) {
        ObjectNode root = objectMapper.createObjectNode();
        root.put("title", quiz.getTitle());
        root.set("scoring", scoringNode(quiz));

        ArrayNode questionsNode = root.putArray("questions");

        for (int index = 0; index < questions.size(); index++) {
            Question question = questions.get(index);
            ObjectNode questionNode = questionsNode.addObject();
            questionNode.put("content", question.getContent());

            if (question.getImageData() != null && question.getImageData().length > 0) {
                String filename = question.getImageFilename() != null
                        ? question.getImageFilename()
                        : "image" + (index + 1) + ".jpg";
                questionNode.put("image", filename);
            } else {
                questionNode.putNull("image");
            }

            ArrayNode answersNode = questionNode.putArray("answers");

            question.getAnswers().forEach(answer -> {
                ObjectNode answerNode = answersNode.addObject();
                answerNode.put("content", answer.getContent());
                answerNode.put("correct", answer.isCorrect());

                if (answer.getPoints() != null) {
                    answerNode.put("points", answer.getPoints());
                }
            });
        }

        try (ByteArrayOutputStream archive = new ByteArrayOutputStream();
             ZipOutputStream zip = new ZipOutputStream(archive)) {
            zip.putNextEntry(new ZipEntry(QUIZ_JSON));
            zip.write(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(root));
            zip.closeEntry();

            for (int index = 0; index < questions.size(); index++) {
                Question question = questions.get(index);

                if (question.getImageData() == null || question.getImageData().length == 0) {
                    continue;
                }

                String filename = question.getImageFilename() != null
                        ? question.getImageFilename()
                        : "image" + (index + 1) + ".jpg";
                zip.putNextEntry(new ZipEntry("images/" + filename));
                zip.write(question.getImageData());
                zip.closeEntry();
            }

            zip.finish();
            return archive.toByteArray();
        } catch (IOException exception) {
            throw new IllegalStateException("Could not export quiz", exception);
        }
    }
}
