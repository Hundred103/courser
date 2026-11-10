package net.edu.courser.user.service;

import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import net.edu.courser.user.entity.User;
import net.edu.courser.user.entity.UserRole;
import net.edu.courser.user.repository.UserRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class UserService {

    private static final Set<String> ACCENT_COLORS = Set.of("coral", "blue", "green", "violet", "turquoise", "pink");

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public List<User> getAllUsers() {
        return userRepository.findAll();
    }

    public Optional<User> getUserById(Long id) {
        return userRepository.findById(id);
    }

    public Optional<User> getUserByUsername(String username) {
        return userRepository.findByUsername(username);
    }

    @Transactional
    public User createUser(User user) {
        String username = validateUsername(user.getUsername());
        boolean emailTaken = userRepository.existsByEmail(user.getEmail());
        boolean usernameTaken = userRepository.existsByUsername(username);

        if (emailTaken && usernameTaken) {
            throw new RuntimeException("Podany email oraz nazwa użytkownika są zajęte");
        }
        if (emailTaken) {
            throw new RuntimeException("Podany email jest zajęty");
        }
        if (usernameTaken) {
            throw new RuntimeException("Podana nazwa użytkownika jest zajęta");
        }

        user.setUsername(username);
        user.setAccentColor("coral");
        user.setPassword(passwordEncoder.encode(user.getPassword()));
        user.setRole(UserRole.STUDENT);
        return userRepository.save(user);
    }

    @Transactional
    public User login(String email, String password) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("Nieprawidłowy email lub hasło"));

        if (!passwordEncoder.matches(password, user.getPassword())) {
            throw new RuntimeException("Nieprawidłowy email lub hasło");
        }

        updateLastLogin(user.getId());
        return user;
    }

    @Transactional
    public User updateUser(Long id, User userDetails) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("User not found with id: " + id));

        user.setUsername(userDetails.getUsername());
        user.setEmail(userDetails.getEmail());

        return userRepository.save(user);
    }

    @Transactional
    public User updateSettings(Long id, String requestedUsername, String requestedAccentColor) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Nie znaleziono użytkownika."));
        String username = validateUsername(requestedUsername);

        if (!username.equals(user.getUsername()) && userRepository.existsByUsername(username)) {
            throw new RuntimeException("Podana nazwa użytkownika jest zajęta");
        }
        if (!ACCENT_COLORS.contains(requestedAccentColor)) {
            throw new RuntimeException("Nieprawidłowy kolor akcentujący.");
        }

        user.setUsername(username);
        user.setAccentColor(requestedAccentColor);
        return userRepository.save(user);
    }

    @Transactional
    public void updateUserScore(Long userId, int additionalScore) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        user.setTotalScore(user.getTotalScore() + additionalScore);
        user.setQuizzesCompleted(user.getQuizzesCompleted() + 1);
        userRepository.save(user);
    }

    public List<User> getLeaderboard() {
        return userRepository.findTopByTotalScore();
    }

    @Transactional
    public void updateLastLogin(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));
        user.setLastLogin(LocalDateTime.now());
        userRepository.save(user);
    }

    private String validateUsername(String requestedUsername) {
        String username = requestedUsername == null ? "" : requestedUsername.trim();
        if (username.isEmpty()) {
            throw new RuntimeException("Podaj nazwę użytkownika.");
        }
        if (username.matches(".*\\s.*")) {
            throw new RuntimeException("Nazwa użytkownika musi być jednym ciągiem bez spacji.");
        }
        if (!username.matches("[A-Za-z0-9]+")) {
            throw new RuntimeException("Użyj tylko liter bez polskich znaków i cyfr.");
        }
        return username;
    }
}
