package net.edu.courser.user.service;

import lombok.RequiredArgsConstructor;
import net.edu.courser.user.exception.AuthenticationFailedException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import net.edu.courser.user.entity.User;
import net.edu.courser.user.repository.UserRepository;

import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Set;

/** Validation → IllegalArgumentException (400). */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class UserService {

    private static final Set<String> ACCENT_COLORS = Set.of("coral", "blue", "green", "violet", "turquoise", "pink");
    private static final String INVALID_CREDENTIALS = "Nieprawidłowy email lub hasło";

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @Transactional
    public User register(String requestedEmail, String requestedUsername, String password) {
        String email = validateEmail(requestedEmail);
        String username = validateUsername(requestedUsername);
        validatePassword(password);
        boolean emailTaken = userRepository.existsByEmailIgnoreCase(email);
        boolean usernameTaken = userRepository.existsByUsernameIgnoreCase(username);

        if (emailTaken && usernameTaken) {
            throw new IllegalArgumentException("Podany email oraz nazwa użytkownika są zajęte");
        }
        if (emailTaken) {
            throw new IllegalArgumentException("Podany email jest zajęty");
        }
        if (usernameTaken) {
            throw new IllegalArgumentException("Podana nazwa użytkownika jest zajęta");
        }

        return userRepository.save(User.builder()
                .email(email)
                .username(username)
                .password(passwordEncoder.encode(password))
                .build());
    }

    public User login(String email, String password) {
        if (email == null || password == null) throw new AuthenticationFailedException(INVALID_CREDENTIALS);
        // Legacy mixed-case emails: password check selects the match.
        return userRepository.findAllByEmailIgnoreCase(email.trim()).stream()
                .filter(candidate -> passwordEncoder.matches(password, candidate.getPassword()))
                .findFirst()
                .orElseThrow(() -> new AuthenticationFailedException(INVALID_CREDENTIALS));
    }

    @Transactional
    public User updateSettings(Long id, String requestedUsername, String requestedAccentColor) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new AuthenticationFailedException("Sesja wygasła. Zaloguj się ponownie."));
        String username = validateUsername(requestedUsername);

        if (!username.equalsIgnoreCase(user.getUsername()) && userRepository.existsByUsernameIgnoreCase(username)) {
            throw new IllegalArgumentException("Podana nazwa użytkownika jest zajęta");
        }
        if (!ACCENT_COLORS.contains(requestedAccentColor)) {
            throw new IllegalArgumentException("Nieprawidłowy kolor akcentujący.");
        }

        user.setUsername(username);
        user.setAccentColor(requestedAccentColor);
        return userRepository.save(user);
    }

    private String validateEmail(String requestedEmail) {
        String email = requestedEmail == null ? "" : requestedEmail.trim().toLowerCase(Locale.ROOT);
        if (email.isEmpty()) {
            throw new IllegalArgumentException("Podaj adres e-mail.");
        }
        if (email.length() > 255 || !email.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}")) {
            throw new IllegalArgumentException("Adres e-mail musi mieć poprawny format, np. nazwa@domena.pl.");
        }
        return email;
    }

    private void validatePassword(String password) {
        if (password == null || password.length() < 8) {
            throw new IllegalArgumentException("Hasło musi mieć co najmniej 8 znaków.");
        }
        if (!password.matches(".*\\d.*")) {
            throw new IllegalArgumentException("Hasło musi zawierać cyfrę.");
        }
        if (!password.matches(".*[^A-Za-z0-9].*")) {
            throw new IllegalArgumentException("Hasło musi zawierać znak specjalny.");
        }
        if (password.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new IllegalArgumentException("Hasło może mieć najwyżej 72 bajty.");
        }
    }

    private String validateUsername(String requestedUsername) {
        String username = requestedUsername == null ? "" : requestedUsername.trim();
        if (username.isEmpty()) {
            throw new IllegalArgumentException("Podaj nazwę użytkownika.");
        }
        if (username.matches(".*\\s.*")) {
            throw new IllegalArgumentException("Nazwa użytkownika musi być jednym ciągiem bez spacji.");
        }
        if (!username.matches("[A-Za-z0-9]+")) {
            throw new IllegalArgumentException("Użyj tylko liter bez polskich znaków i cyfr.");
        }
        if (username.length() > 255) {
            throw new IllegalArgumentException("Nazwa użytkownika może mieć najwyżej 255 znaków.");
        }
        return username;
    }
}
