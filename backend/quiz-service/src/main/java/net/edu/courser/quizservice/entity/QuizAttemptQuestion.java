package net.edu.courser.quizservice.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Entity
@Table(
        name = "quiz_attempt_questions",
        uniqueConstraints = @UniqueConstraint(
                name = "uq_quiz_attempt_questions_attempt_question",
                columnNames = {"attempt_id", "question_id"}
        )
)
public class QuizAttemptQuestion {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "attempt_id", nullable = false)
    private QuizAttempt attempt;

    @Column(name = "question_id", nullable = false)
    private Long questionId;

    @Column(name = "started_at", nullable = false)
    private LocalDateTime startedAt;

    @Column(name = "deadline_at")
    private LocalDateTime deadlineAt;

    @Column(name = "submitted_at")
    private LocalDateTime submittedAt;

    @Column(name = "selected_answer_ids", length = 2000)
    private String selectedAnswerIds;
}
