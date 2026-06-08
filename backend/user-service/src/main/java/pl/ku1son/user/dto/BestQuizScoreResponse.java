package pl.ku1son.user.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BestQuizScoreResponse {
    private Long quizId;
    private Integer score;
    private Integer maxScore;
}
