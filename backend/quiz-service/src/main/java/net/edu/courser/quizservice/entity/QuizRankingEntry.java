package net.edu.courser.quizservice.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
@Entity @Table(name="quiz_ranking_entries", uniqueConstraints=@UniqueConstraint(name="uk_quiz_ranking_entries_user", columnNames={"ranking_version_id","user_id"}))
public class QuizRankingEntry {
 @Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long id;
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="ranking_version_id", nullable=false) private QuizRankingVersion rankingVersion;
 @Column(name="user_id", nullable=false) private Long userId;
 @Column(name="score_scaled", nullable=false) private int scoreScaled;
 @Column(name="max_score_scaled", nullable=false) private int maxScoreScaled;
 @Column(name="duration_ms", nullable=false) private long durationMs;
 @Column(name="completed_at", nullable=false) private LocalDateTime completedAt;
}
