package net.edu.courser.user.service;

import net.edu.courser.user.entity.RefreshSession;
import net.edu.courser.user.entity.User;
import net.edu.courser.user.repository.RefreshSessionRepository;
import net.edu.courser.user.repository.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Base64;

@Service
public class RefreshSessionService {
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private final RefreshSessionRepository refreshSessionRepository;
    private final UserRepository userRepository;
    private final Duration inactivityDuration;

    public RefreshSessionService(
            RefreshSessionRepository refreshSessionRepository,
            UserRepository userRepository,
            @Value("${app.refresh-session.inactivity-hours:48}") long inactivityHours
    ) {
        this.refreshSessionRepository = refreshSessionRepository;
        this.userRepository = userRepository;
        this.inactivityDuration = Duration.ofHours(inactivityHours);
    }

    @Transactional
    public String create(User user) {
        String rawToken = generateToken();
        LocalDateTime now = LocalDateTime.now();
        refreshSessionRepository.save(RefreshSession.builder()
                .user(user)
                .tokenHash(hash(rawToken))
                .lastUsedAt(now)
                .expiresAt(now.plus(inactivityDuration))
                .build());
        return rawToken;
    }

    @Transactional
    public RefreshResult rotate(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            throw new IllegalArgumentException("Brak sesji odświeżającej.");
        }

        RefreshSession session = refreshSessionRepository.findByTokenHash(hash(rawToken))
                .orElseThrow(() -> new IllegalArgumentException("Nieprawidłowa sesja odświeżająca."));
        LocalDateTime now = LocalDateTime.now();

        if (!session.getExpiresAt().isAfter(now)) {
            refreshSessionRepository.delete(session);
            throw new IllegalArgumentException("Sesja odświeżająca wygasła.");
        }

        User user = userRepository.findById(session.getUser().getId())
                .orElseThrow(() -> new IllegalArgumentException("Użytkownik sesji nie istnieje."));
        refreshSessionRepository.delete(session);
        String nextToken = create(user);
        refreshSessionRepository.deleteByExpiresAtBefore(now);
        return new RefreshResult(user, nextToken);
    }

    @Transactional
    public void revoke(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) return;
        refreshSessionRepository.findByTokenHash(hash(rawToken)).ifPresent(refreshSessionRepository::delete);
    }

    private String generateToken() {
        byte[] bytes = new byte[32];
        SECURE_RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String hash(String rawToken) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(rawToken.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder();
            for (byte value : digest) result.append(String.format("%02x", value));
            return result.toString();
        } catch (Exception exception) {
            throw new IllegalStateException("Nie udało się zabezpieczyć sesji odświeżającej.", exception);
        }
    }

    public record RefreshResult(User user, String rawToken) {}
}
