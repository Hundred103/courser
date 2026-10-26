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
 @Column(name = "started_at", nullable = false) private LocalDateTime startedAt;
 @Column(name = "completed_at") private LocalDateTime completedAt;
 @Column(nullable = false) private String status;
 @PrePersist void created(){ if(id==null) id=UUID.randomUUID(); if(startedAt==null) startedAt=LocalDateTime.now(); if(status==null) status="STARTED"; }
}
