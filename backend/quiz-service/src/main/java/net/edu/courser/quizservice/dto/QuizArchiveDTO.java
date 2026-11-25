package net.edu.courser.quizservice.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

/** quiz.json in ZIP; question images are filenames under images/. */
public record QuizArchiveDTO(
        String title,
        QuizScoringDTO scoring,
        QuizLimitsDTO limits,
        @JsonProperty("_ranking") RankingReference ranking,
        List<QuestionCreateDTO> questions
) {
    public record RankingReference(String versionId) {}
}
