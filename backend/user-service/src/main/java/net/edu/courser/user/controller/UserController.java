package net.edu.courser.user.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.bind.annotation.*;
import net.edu.courser.user.dto.BestQuizScoreResponse;
import net.edu.courser.user.dto.CompleteQuizAttemptRequest;
import net.edu.courser.user.dto.LoginRequest;
import net.edu.courser.user.dto.LoginResponse;
import net.edu.courser.user.dto.RegisterRequest;
import net.edu.courser.user.dto.SaveQuizResultRequest;
import net.edu.courser.user.dto.UserProfileResponse;
import net.edu.courser.user.entity.QuizResult;
import net.edu.courser.user.entity.User;
import net.edu.courser.user.security.JwtClaims;
import net.edu.courser.user.security.JwtService;
import net.edu.courser.user.service.UserStatisticsService;
import net.edu.courser.user.dto.CompleteStatisticsRequest;
import net.edu.courser.user.service.UserService;
import net.edu.courser.user.service.RefreshSessionService;

import java.time.Duration;
import java.util.List;

@RestController
@RequestMapping("/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;
    private final UserStatisticsService userStatisticsService;
    private final JwtService jwtService;
    private final RefreshSessionService refreshSessionService;

    @org.springframework.beans.factory.annotation.Value("${app.refresh-cookie.secure:false}")
    private boolean refreshCookieSecure;

    private static final String REFRESH_COOKIE_NAME = "courser_refresh";
    private static final Duration REFRESH_SESSION_DURATION = Duration.ofHours(48);

    @GetMapping
    public ResponseEntity<List<UserProfileResponse>> getAllUsers() {
        return ResponseEntity.ok(userService.getAllUsers().stream().map(this::toProfileResponse).toList());
    }

    @GetMapping("/me")
    public ResponseEntity<UserProfileResponse> getCurrentUser(@AuthenticationPrincipal JwtClaims claims) {
        return userService.getUserById(claims.userId())
                .map(this::toProfileResponse)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/{id}")
    public ResponseEntity<UserProfileResponse> getUserById(
            @PathVariable Long id,
            @AuthenticationPrincipal JwtClaims claims
    ) {
        ensureCanAccessUser(id, claims);
        return userService.getUserById(id)
                .map(this::toProfileResponse)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/username/{username}")
    public ResponseEntity<UserProfileResponse> getUserByUsername(@PathVariable String username) {
        return userService.getUserByUsername(username)
                .map(this::toProfileResponse)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody RegisterRequest request) {
        try {
            User user = User.builder()
                    .email(request.getEmail())
                    .username(request.getUsername())
                    .password(request.getPassword())
                    .build();

            User created = userService.createUser(user);

            LoginResponse response = LoginResponse.builder()
                    .id(created.getId())
                    .email(created.getEmail())
                    .username(created.getUsername())
                    .token(jwtService.createToken(created))
                    .message("Rejestracja powiodła się")
                    .build();

            return ResponseEntity.status(HttpStatus.CREATED)
                    .header(HttpHeaders.SET_COOKIE, refreshCookie(refreshSessionService.create(created)).toString())
                    .body(response);
        } catch (RuntimeException e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(java.util.Collections.singletonMap("error", e.getMessage()));
        }
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest request) {
        try {
            User user = userService.login(request.getEmail(), request.getPassword());

            LoginResponse response = LoginResponse.builder()
                    .id(user.getId())
                    .email(user.getEmail())
                    .username(user.getUsername())
                    .token(jwtService.createToken(user))
                    .message("Zalogowano pomyślnie")
                    .build();

            return ResponseEntity.ok()
                    .header(HttpHeaders.SET_COOKIE, refreshCookie(refreshSessionService.create(user)).toString())
                    .body(response);
        } catch (RuntimeException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(java.util.Collections.singletonMap("error", e.getMessage()));
        }
    }

    @PostMapping("/refresh")
    public ResponseEntity<?> refresh(@CookieValue(value = REFRESH_COOKIE_NAME, required = false) String refreshToken) {
        try {
            RefreshSessionService.RefreshResult refreshed = refreshSessionService.rotate(refreshToken);
            User user = refreshed.user();
            LoginResponse response = LoginResponse.builder()
                    .id(user.getId())
                    .email(user.getEmail())
                    .username(user.getUsername())
                    .token(jwtService.createToken(user))
                    .message("Sesja odświeżona")
                    .build();
            return ResponseEntity.ok()
                    .header(HttpHeaders.SET_COOKIE, refreshCookie(refreshed.rawToken()).toString())
                    .body(response);
        } catch (RuntimeException exception) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .header(HttpHeaders.SET_COOKIE, clearRefreshCookie().toString())
                    .body(java.util.Collections.singletonMap("error", "Sesja wygasła. Zaloguj się ponownie."));
        }
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@CookieValue(value = REFRESH_COOKIE_NAME, required = false) String refreshToken) {
        refreshSessionService.revoke(refreshToken);
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, clearRefreshCookie().toString())
                .build();
    }

    @PutMapping("/{id}")
    public ResponseEntity<UserProfileResponse> updateUser(
            @PathVariable Long id,
            @RequestBody User user,
            @AuthenticationPrincipal JwtClaims claims
    ) {
        ensureCanAccessUser(id, claims);
        return ResponseEntity.ok(toProfileResponse(userService.updateUser(id, user)));
    }

    @PostMapping("/{id}/score")
    public ResponseEntity<Void> updateScore(
            @PathVariable Long id,
            @RequestParam int score,
            @AuthenticationPrincipal JwtClaims claims
    ) {
        ensureCanAccessUser(id, claims);
        userService.updateUserScore(id, score);
        return ResponseEntity.ok().build();
    }

    @GetMapping("/leaderboard")
    public ResponseEntity<List<UserProfileResponse>> getLeaderboard() {
        return ResponseEntity.ok(userService.getLeaderboard().stream().map(this::toProfileResponse).toList());
    }

    @GetMapping("/{id}/quiz-results/best")
    public ResponseEntity<?> getBestQuizScores(
            @PathVariable Long id,
            @AuthenticationPrincipal JwtClaims claims
    ) {
        try {
            ensureCanAccessUser(id, claims);
            List<BestQuizScoreResponse> scores = userStatisticsService.bestScores(id);
            return ResponseEntity.ok(scores);
        } catch (RuntimeException e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(java.util.Collections.singletonMap("error", e.getMessage()));
        }
    }

    @GetMapping("/me/quiz-results/best")
    public ResponseEntity<?> getCurrentUserBestQuizScores(@AuthenticationPrincipal JwtClaims claims) {
        try {
            List<BestQuizScoreResponse> scores = userStatisticsService.bestScores(claims.userId());
            return ResponseEntity.ok(scores);
        } catch (RuntimeException e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(java.util.Collections.singletonMap("error", e.getMessage()));
        }
    }

    @GetMapping("/me/quiz-attempts/count")
    public ResponseEntity<?> getCurrentUserCompletedAttemptsCount(
            @AuthenticationPrincipal JwtClaims claims,
            @RequestParam Long quizId
    ) {
        try {
            return ResponseEntity.ok(userStatisticsService.count(claims.userId(), quizId));
        } catch (RuntimeException e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(java.util.Collections.singletonMap("error", e.getMessage()));
        }
    }

    @PostMapping("/me/statistics/completions")
    public ResponseEntity<Void> completeStatistics(@AuthenticationPrincipal JwtClaims claims,
                                                   @RequestBody CompleteStatisticsRequest request) {
        userStatisticsService.complete(claims.userId(), request);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/me/statistics/daily")
    public List<UserStatisticsService.DailyStatistics> getDailyStatistics(@AuthenticationPrincipal JwtClaims claims) {
        return userStatisticsService.daily(claims.userId());
    }

    private void ensureCanAccessUser(Long userId, JwtClaims claims) {
        if (!userId.equals(claims.userId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Brak dostępu do danych tego użytkownika");
        }
    }

    private UserProfileResponse toProfileResponse(User user) {
        return new UserProfileResponse(
                user.getId(),
                user.getEmail(),
                user.getUsername(),
                user.getRole(),
                user.getTotalScore(),
                user.getQuizzesCompleted(),
                user.getCreatedAt(),
                user.getLastLogin()
        );
    }

    private ResponseCookie refreshCookie(String value) {
        return ResponseCookie.from(REFRESH_COOKIE_NAME, value)
                .httpOnly(true)
                .secure(refreshCookieSecure)
                .sameSite("Lax")
                .path("/api/users")
                .maxAge(REFRESH_SESSION_DURATION)
                .build();
    }

    private ResponseCookie clearRefreshCookie() {
        return ResponseCookie.from(REFRESH_COOKIE_NAME, "")
                .httpOnly(true)
                .secure(refreshCookieSecure)
                .sameSite("Lax")
                .path("/api/users")
                .maxAge(Duration.ZERO)
                .build();
    }
}
