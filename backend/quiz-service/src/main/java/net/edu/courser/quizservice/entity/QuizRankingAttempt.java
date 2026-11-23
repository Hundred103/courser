package net.edu.courser.quizservice.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
import java.util.UUID;

@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
@Entity @Table(name = "quiz_ranking_attempts")
public class QuizRankingAttempt {
 @Id private UUID id;
 @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "ranking_version_id", nullable = false) private QuizRankingVersion rankingVersion;
 @Column(name = "user_id", nullable = false) private Long userId;
 @Column(name = "client_session_id", nullable = false) private UUID clientSessionId;
 @Column(name = "started_at", nullable = false) private LocalDateTime startedAt;
 /** Null while the run is in progress. */
 @Column(name = "completed_at") private LocalDateTime completedAt;
 @Column(name = "score_scaled") private Integer scoreScaled;
 @Column(name = "max_score_scaled") private Integer maxScoreScaled;
 @Column(name = "duration_ms") private Long durationMs;
 @Column(name = "position") private Integer position;
 @PrePersist void created(){ if(id==null) id=UUID.randomUUID(); if(startedAt==null) startedAt=LocalDateTime.now(); }

 public boolean isFinished() { return completedAt != null; }
}
