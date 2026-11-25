package net.edu.courser.quizservice.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
import java.util.UUID;

@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
@Entity @Table(name = "quiz_ranking_versions")
public class QuizRankingVersion {
    @Id private UUID id;
    @Column(name = "snapshot_json", nullable = false, columnDefinition = "TEXT") private String snapshotJson;
    @Column(name = "content_hash", nullable = false, length = 64) private String contentHash;
    @Column(name = "has_logged_import", nullable = false) private boolean hasLoggedImport;
    @Column(name = "created_at", nullable = false) private LocalDateTime createdAt;
    @PrePersist void created() { if (createdAt == null) createdAt = LocalDateTime.now(); if (id == null) id = UUID.randomUUID(); }
}
