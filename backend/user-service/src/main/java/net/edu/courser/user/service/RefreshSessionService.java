package net.edu.courser.user.service;

import lombok.Getter;
import net.edu.courser.user.entity.RefreshSession;
import net.edu.courser.user.entity.User;
import net.edu.courser.user.exception.AuthenticationFailedException;
import net.edu.courser.user.repository.RefreshSessionRepository;
import net.edu.courser.user.repository.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;

@Service
public class RefreshSessionService {
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();
    private static final String SESSION_EXPIRED = "Sesja wygasła. Zaloguj się ponownie.";

    private final RefreshSessionRepository refreshSessionRepository;
    private final UserRepository userRepository;
    /** Cookie max-age matches session TTL. */
    @Getter
    private final Duration inactivityDuration;
    /** Concurrent tabs may rotate the same key; keep a short grace. */
    private final Duration rotationGrace;

    public RefreshSessionService(
            RefreshSessionRepository refreshSessionRepository,
            UserRepository userRepository,
            @Value("${app.refresh-session.inactivity-hours}") long inactivityHours,
            @Value("${app.refresh-session.rotation-grace-seconds}") long rotationGraceSeconds
    ) {
        this.refreshSessionRepository = refreshSessionRepository;
        this.userRepository = userRepository;
        this.inactivityDuration = Duration.ofHours(inactivityHours);
        this.rotationGrace = Duration.ofSeconds(rotationGraceSeconds);
    }

    @Transactional
    public String create(User user) {
        return createInFamily(user, UUID.randomUUID());
    }

    @Transactional(noRollbackFor = AuthenticationFailedException.class)
    public RefreshResult rotate(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            throw new AuthenticationFailedException(SESSION_EXPIRED);
        }

        RefreshSession session = refreshSessionRepository.findByTokenHash(hash(rawToken))
                .orElseThrow(() -> new AuthenticationFailedException(SESSION_EXPIRED));
        LocalDateTime now = LocalDateTime.now();

        if (!session.getExpiresAt().isAfter(now)) {
            refreshSessionRepository.delete(session);
            throw new AuthenticationFailedException(SESSION_EXPIRED);
        }

        User user = userRepository.findById(session.getUser().getId())
                .orElseThrow(() -> new AuthenticationFailedException(SESSION_EXPIRED));
        LocalDateTime graceEnd = now.plus(rotationGrace);
        if (session.getExpiresAt().isAfter(graceEnd)) session.setExpiresAt(graceEnd);
        session.setLastUsedAt(now);
        String nextToken = createInFamily(user, session.getFamilyId());
        refreshSessionRepository.deleteByExpiresAtBefore(now);
        return new RefreshResult(user, nextToken);
    }

    /** Revokes every key in the rotated session family (grace siblings included). */
    @Transactional
    public void revoke(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) return;
        refreshSessionRepository.findByTokenHash(hash(rawToken)).ifPresent(session ->
                refreshSessionRepository.deleteByFamilyId(session.getFamilyId()));
    }

    private String createInFamily(User user, UUID familyId) {
        String rawToken = generateToken();
        LocalDateTime now = LocalDateTime.now();
        refreshSessionRepository.save(RefreshSession.builder()
                .user(user)
                .tokenHash(hash(rawToken))
                .familyId(familyId)
                .lastUsedAt(now)
                .expiresAt(now.plus(inactivityDuration))
                .build());
        return rawToken;
    }

    private String generateToken() {
        byte[] bytes = new byte[32];
        SECURE_RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String hash(String rawToken) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(rawToken.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 unavailable", exception);
        }
    }

    public record RefreshResult(User user, String rawToken) {}
}
