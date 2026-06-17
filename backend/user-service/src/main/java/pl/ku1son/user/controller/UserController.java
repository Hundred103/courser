package pl.ku1son.user.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import pl.ku1son.user.dto.BestQuizScoreResponse;
import pl.ku1son.user.dto.LoginRequest;
import pl.ku1son.user.dto.LoginResponse;
import pl.ku1son.user.dto.RegisterRequest;
import pl.ku1son.user.dto.SaveQuizResultRequest;
import pl.ku1son.user.entity.QuizResult;
import pl.ku1son.user.entity.User;
import pl.ku1son.user.service.QuizResultService;
import pl.ku1son.user.service.UserService;

import java.util.List;

@RestController
@RequestMapping("/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;
    private final QuizResultService quizResultService;

    @GetMapping
    public ResponseEntity<List<User>> getAllUsers() {
        return ResponseEntity.ok(userService.getAllUsers());
    }

    @GetMapping("/{id}")
    public ResponseEntity<User> getUserById(@PathVariable Long id) {
        return userService.getUserById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/username/{username}")
    public ResponseEntity<User> getUserByUsername(@PathVariable String username) {
        return userService.getUserByUsername(username)
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
                    .message("Zalogowano pomyślnie")
                    .build();

            return ResponseEntity.ok(response);
        } catch (RuntimeException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(java.util.Collections.singletonMap("error", e.getMessage()));
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<User> updateUser(@PathVariable Long id, @RequestBody User user) {
        return ResponseEntity.ok(userService.updateUser(id, user));
    }

    @PostMapping("/{id}/score")
    public ResponseEntity<Void> updateScore(@PathVariable Long id, @RequestParam int score) {
        userService.updateUserScore(id, score);
        return ResponseEntity.ok().build();
    }

    @GetMapping("/leaderboard")
    public ResponseEntity<List<User>> getLeaderboard() {
        return ResponseEntity.ok(userService.getLeaderboard());
    }

    @PostMapping("/{id}/quiz-results")
    public ResponseEntity<?> saveQuizResult(@PathVariable Long id, @RequestBody SaveQuizResultRequest request) {
        try {
            QuizResult saved = quizResultService.saveResult(id, request);
            return ResponseEntity.status(HttpStatus.CREATED).body(saved);
        } catch (RuntimeException e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(java.util.Collections.singletonMap("error", e.getMessage()));
        }
    }

    @GetMapping("/{id}/quiz-results/best")
    public ResponseEntity<?> getBestQuizScores(@PathVariable Long id) {
        try {
            List<BestQuizScoreResponse> scores = quizResultService.getBestScoresByUser(id);
            return ResponseEntity.ok(scores);
        } catch (RuntimeException e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(java.util.Collections.singletonMap("error", e.getMessage()));
        }
    }
}
