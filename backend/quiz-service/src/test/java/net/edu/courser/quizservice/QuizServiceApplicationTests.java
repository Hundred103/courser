package net.edu.courser.quizservice;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

/** Needs migrated DB (ddl-auto=validate). */
@SpringBootTest(properties = "app.media.storage-path=${java.io.tmpdir}/courser-media")
class QuizServiceApplicationTests {

    @Test
    void contextLoads() {
    }

}
