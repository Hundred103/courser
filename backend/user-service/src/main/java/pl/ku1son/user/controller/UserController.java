package pl.ku1son.user.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.bind.annotation.*;
import pl.ku1son.user.dto.BestQuizScoreResponse;
import pl.ku1son.user.dto.LoginRequest;
import pl.ku1son.user.dto.LoginResponse;
import pl.ku1son.user.dto.RegisterRequest;
import pl.ku1son.user.dto.SaveQuizResultRequest;
import pl.ku1son.user.dto.UserProfileResponse;
import pl.ku1son.user.entity.QuizResult;
import pl.ku1son.user.entity.User;
import pl.ku1son.user.security.JwtClaims;
import pl.ku1son.user.security.JwtService;
import pl.ku1son.user.service.QuizResultService;
import pl.ku1son.user.service.UserService;

import java.util.List;

@RestController
@RequestMapping("/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;
    private final QuizResultService quizResultService;
    private final JwtService jwtService;

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

            return ResponseEntity.status(HttpStatus.CREATED).body(response);
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

            return ResponseEntity.ok(response);
        } catch (RuntimeException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(java.util.Collections.singletonMap("error", e.getMessage()));
        }
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

    @PostMapping("/{id}/quiz-results")
    public ResponseEntity<?> saveQuizResult(
            @PathVariable Long id,
            @RequestBody SaveQuizResultRequest request,
            @AuthenticationPrincipal JwtClaims claims
    ) {
        try {
            ensureCanAccessUser(id, claims);
            QuizResult saved = quizResultService.saveResult(id, request);
            return ResponseEntity.status(HttpStatus.CREATED).body(saved);
        } catch (RuntimeException e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(java.util.Collections.singletonMap("error", e.getMessage()));
        }
    }

    @PostMapping("/me/quiz-results")
    public ResponseEntity<?> saveCurrentUserQuizResult(
            @AuthenticationPrincipal JwtClaims claims,
            @RequestBody SaveQuizResultRequest request
    ) {
        try {
            QuizResult saved = quizResultService.saveResult(claims.userId(), request);
            return ResponseEntity.status(HttpStatus.CREATED).body(saved);
        } catch (RuntimeException e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(java.util.Collections.singletonMap("error", e.getMessage()));
        }
    }

    @GetMapping("/{id}/quiz-results/best")
    public ResponseEntity<?> getBestQuizScores(
            @PathVariable Long id,
            @AuthenticationPrincipal JwtClaims claims
    ) {
        try {
            ensureCanAccessUser(id, claims);
            List<BestQuizScoreResponse> scores = quizResultService.getBestScoresByUser(id);
            return ResponseEntity.ok(scores);
        } catch (RuntimeException e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(java.util.Collections.singletonMap("error", e.getMessage()));
        }
    }

    @GetMapping("/me/quiz-results/best")
    public ResponseEntity<?> getCurrentUserBestQuizScores(@AuthenticationPrincipal JwtClaims claims) {
        try {
            List<BestQuizScoreResponse> scores = quizResultService.getBestScoresByUser(claims.userId());
            return ResponseEntity.ok(scores);
        } catch (RuntimeException e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(java.util.Collections.singletonMap("error", e.getMessage()));
        }
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
}
