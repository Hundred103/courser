package net.edu.courser.user.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import net.edu.courser.user.dto.CompleteStatisticsRequest;
import net.edu.courser.user.dto.LoginRequest;
import net.edu.courser.user.dto.LoginResponse;
import net.edu.courser.user.dto.RegisterRequest;
import net.edu.courser.user.dto.UpdateUserSettingsRequest;
import net.edu.courser.user.entity.User;
import net.edu.courser.user.security.JwtService;
import net.edu.courser.user.service.RefreshSessionService;
import net.edu.courser.user.service.UserService;
import net.edu.courser.user.service.UserStatisticsService;

import java.time.Duration;
import java.util.List;

/** Public: register/login/refresh/logout; other routes need gateway JWT → X-User-Id. */
@RestController
@RequestMapping("/users")
@RequiredArgsConstructor
public class UserController {
    private static final String REFRESH_COOKIE_NAME = "courser_refresh";

    private final UserService userService;
    private final UserStatisticsService userStatisticsService;
    private final JwtService jwtService;
    private final RefreshSessionService refreshSessionService;

    @Value("${app.refresh-cookie.secure}")
    private boolean refreshCookieSecure;

    @PostMapping("/register")
    public ResponseEntity<LoginResponse> register(@RequestBody RegisterRequest request) {
        User created = userService.register(request.email(), request.username(), request.password());
        return ResponseEntity.status(HttpStatus.CREATED)
                .header(HttpHeaders.SET_COOKIE, refreshCookie(refreshSessionService.create(created)))
                .body(loginResponse(created));
    }

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@RequestBody LoginRequest request) {
        User user = userService.login(request.email(), request.password());
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, refreshCookie(refreshSessionService.create(user)))
                .body(loginResponse(user));
    }

    /** Failed refresh keeps cookie (other-tab race). */
    @PostMapping("/refresh")
    public ResponseEntity<LoginResponse> refresh(@CookieValue(value = REFRESH_COOKIE_NAME, required = false) String refreshToken) {
        RefreshSessionService.RefreshResult refreshed = refreshSessionService.rotate(refreshToken);
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, refreshCookie(refreshed.rawToken()))
                .body(loginResponse(refreshed.user()));
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@CookieValue(value = REFRESH_COOKIE_NAME, required = false) String refreshToken) {
        refreshSessionService.revoke(refreshToken);
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, cookie("", Duration.ZERO))
                .build();
    }

    /** Username is in the JWT → reissue token. */
    @PutMapping("/me/settings")
    public LoginResponse updateCurrentUserSettings(@RequestHeader("X-User-Id") Long userId, @RequestBody UpdateUserSettingsRequest request) {
        return loginResponse(userService.updateSettings(userId, request.username(), request.accentColor()));
    }

    @GetMapping("/me/quiz-attempts/count")
    public long getCurrentUserCompletedAttemptsCount(@RequestHeader("X-User-Id") Long userId, @RequestParam Long quizId) {
        return userStatisticsService.count(userId, quizId);
    }

    @PostMapping("/me/statistics/completions")
    public ResponseEntity<Void> completeStatistics(@RequestHeader("X-User-Id") Long userId, @RequestBody CompleteStatisticsRequest request) {
        userStatisticsService.complete(userId, request);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/me/statistics/daily")
    public List<UserStatisticsService.DailyStatistics> getDailyStatistics(@RequestHeader("X-User-Id") Long userId) {
        return userStatisticsService.daily(userId);
    }

    private LoginResponse loginResponse(User user) {
        return new LoginResponse(user.getId(), user.getEmail(), user.getUsername(), user.getAccentColor(), jwtService.createToken(user));
    }

    private String refreshCookie(String value) {
        return cookie(value, refreshSessionService.getInactivityDuration());
    }

    private String cookie(String value, Duration maxAge) {
        return ResponseCookie.from(REFRESH_COOKIE_NAME, value)
                .httpOnly(true)
                .secure(refreshCookieSecure)
                .sameSite("Lax")
                .path("/api/users")
                .maxAge(maxAge)
                .build()
                .toString();
    }
}
