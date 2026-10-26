package net.edu.courser.user.repository;

import net.edu.courser.user.entity.RefreshSession;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

public interface RefreshSessionRepository extends JpaRepository<RefreshSession, UUID> {
    Optional<RefreshSession> findByTokenHash(String tokenHash);
    long deleteByExpiresAtBefore(LocalDateTime threshold);
}
