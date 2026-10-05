package net.edu.courser.quizservice.entity;
import jakarta.persistence.*;
import lombok.*;
import java.util.Set;
import java.util.HashSet;
import java.util.List;
import java.util.ArrayList;



@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Entity
@Table(name = "quizzes")
public class Quiz {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Builder.Default
    @OneToMany(mappedBy = "quiz", fetch = FetchType.LAZY, cascade = CascadeType.ALL, orphanRemoval = true)
    //private Set<Question> questions = new HashSet<>();
    @OrderBy("id ASC")
    private List<Question> questions = new ArrayList<>();
    private String title;
    @Column(name = "owner_user_id")
    private Long ownerUserId;
    @Enumerated(EnumType.STRING)
    @Column(name = "scoring_mode", nullable = false)
    @Builder.Default
    private ScoringMode scoringMode = ScoringMode.DEFAULT;
    @Column(name = "allow_negative_score", nullable = false)
    @Builder.Default
    private boolean allowNegativeScore = false;
    @Column(name = "points_per_correct", nullable = false)
    @Builder.Default
    private double pointsPerCorrect = 1;
    @Column(name = "incorrect_penalty", nullable = false)
    @Builder.Default
    private double incorrectPenalty = 1;
    @Enumerated(EnumType.STRING)
    @Column(name = "penalty_mode", nullable = false)
    @Builder.Default
    private PenaltyMode penaltyMode = PenaltyMode.FRACTION;
    @Column(name = "max_attempts")
    private Integer maxAttempts;
    @Column(name = "quiz_time_seconds")
    private Integer quizTimeSeconds;
    @Column(name = "question_time_seconds")
    private Integer questionTimeSeconds;
    @Column(name = "origin_quiz_id")
    private Long originQuizId;
    @Column(name = "random_question_order", nullable = false)
    @Builder.Default
    private boolean randomQuestionOrder = false;
    @Column(name = "show_correct_answers", nullable = false)
    @Builder.Default
    private boolean showCorrectAnswers = true;

    public void addQuestion(Question question) {
        questions.add(question);
        question.setQuiz(this);
    }

    public void removeQuestion(Question question) {
        questions.remove(question);
        question.setQuiz(null);
    }
}
