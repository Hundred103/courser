package pl.ku1son.quizservice.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;
import pl.ku1son.quizservice.entity.Question;
import pl.ku1son.quizservice.entity.Quiz;

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

    public byte[] exportAsZip(Quiz quiz, List<Question> questions) {
        ObjectNode root = objectMapper.createObjectNode();
        root.put("title", quiz.getTitle());

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
