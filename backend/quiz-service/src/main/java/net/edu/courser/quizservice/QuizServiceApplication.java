package net.edu.courser.quizservice;
import net.edu.courser.quizservice.service.MediaStorageService;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;
import tools.jackson.core.StreamReadConstraints;

@SpringBootApplication
@EnableScheduling
public class QuizServiceApplication {
    /** Max Jackson string length for a 16MB image as data URL. */
    static final int MAX_JSON_STRING_LENGTH = (int) ((MediaStorageService.MAX_IMAGE_BYTES + 2) / 3 * 4) + 1024;

    public static void main(String[] args) {
        // Raise Jackson string limit before any ObjectMapper exists.
        StreamReadConstraints.overrideDefaultStreamReadConstraints(
                StreamReadConstraints.builder().maxStringLength(MAX_JSON_STRING_LENGTH).build());
        SpringApplication.run(QuizServiceApplication.class, args);
    }
}
