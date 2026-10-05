package net.edu.courser.quizservice.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Programmer-facing timer knobs. Change them in application.properties.
 * submissionGraceSeconds is the lag buffer after a deadline. It is not shown to students.
 */
@Component
public class QuizTimerSettings {
    private final int submissionGraceSeconds;
    private final int endingWarningSeconds;

    public QuizTimerSettings(
            @Value("${app.quiz.timer.submission-grace-seconds:5}") int submissionGraceSeconds,
            @Value("${app.quiz.timer.ending-warning-seconds:10}") int endingWarningSeconds
    ) {
        this.submissionGraceSeconds = Math.max(0, submissionGraceSeconds);
        this.endingWarningSeconds = Math.max(0, endingWarningSeconds);
    }

    public int getSubmissionGraceSeconds() {
        return submissionGraceSeconds;
    }

    public int getEndingWarningSeconds() {
        return endingWarningSeconds;
    }
}
