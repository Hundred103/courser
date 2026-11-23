package net.edu.courser.user.service;

import net.edu.courser.user.entity.RefreshSession;
import net.edu.courser.user.entity.User;
import net.edu.courser.user.exception.AuthenticationFailedException;
import net.edu.courser.user.repository.RefreshSessionRepository;
import net.edu.courser.user.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class UserAuthRulesTest {
    private UserRepository userRepository;
    private PasswordEncoder passwordEncoder;
    private UserService userService;

    @BeforeEach
    void setUp() {
        userRepository = mock(UserRepository.class);
        passwordEncoder = new BCryptPasswordEncoder(4);
        userService = new UserService(userRepository, passwordEncoder);
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void registrationStoresANormalisedEmail() {
        User created = userService.register("  Jan.Kowalski@Example.PL ", "jan", "Haslo123!");

        assertThat(created.getEmail()).isEqualTo("jan.kowalski@example.pl");
    }

    @Test
    void registrationRejectsWeakPasswords() {
        assertThatThrownBy(() -> userService.register("a@b.pl", "jan", "krotkie")).hasMessageContaining("8 znaków");
        assertThatThrownBy(() -> userService.register("a@b.pl", "jan", "bezcyfry!!")).hasMessageContaining("cyfrę");
        assertThatThrownBy(() -> userService.register("a@b.pl", "jan", "bezznaku123")).hasMessageContaining("znak specjalny");
        assertThatThrownBy(() -> userService.register("a@b.pl", "jan", "1!" + "a".repeat(71))).hasMessageContaining("72 bajty");
    }

    @Test
    void loginIgnoresEmailCaseAndSpaces() {
        User stored = user("Jan@Example.pl", passwordEncoder.encode("Haslo123!"));
        stored.setId(1L);
        when(userRepository.findAllByEmailIgnoreCase("jan@example.PL")).thenReturn(List.of(stored));

        assertThat(userService.login(" jan@example.PL ", "Haslo123!")).isSameAs(stored);
    }

    @Test
    void usernamesDifferingOnlyByCaseAreTaken() {
        when(userRepository.existsByUsernameIgnoreCase("JAN")).thenReturn(true);

        assertThatThrownBy(() -> userService.register("a@b.pl", "JAN", "Haslo123!")).hasMessageContaining("nazwa użytkownika jest zajęta");
    }

    @Test
    void wrongPasswordIsAnAuthenticationFailure() {
        User stored = user("jan@example.pl", passwordEncoder.encode("Haslo123!"));
        when(userRepository.findAllByEmailIgnoreCase("jan@example.pl")).thenReturn(List.of(stored));

        assertThatThrownBy(() -> userService.login("jan@example.pl", "Zle123!!")).isInstanceOf(AuthenticationFailedException.class);
    }

    @Test
    void twoTabsRefreshingWithTheSameKeyBothGetASession() {
        RefreshSessionRepository sessions = mock(RefreshSessionRepository.class);
        Map<String, RefreshSession> byHash = new HashMap<>();
        when(sessions.save(any(RefreshSession.class))).thenAnswer(invocation -> {
            RefreshSession session = invocation.getArgument(0);
            byHash.put(session.getTokenHash(), session);
            return session;
        });
        when(sessions.findByTokenHash(anyString())).thenAnswer(invocation -> Optional.ofNullable(byHash.get(invocation.<String>getArgument(0))));
        User owner = user("a@b.pl", "x");
        owner.setId(1L);
        when(userRepository.findById(1L)).thenReturn(Optional.of(owner));
        RefreshSessionService service = new RefreshSessionService(sessions, userRepository, 48, 30);

        String key = service.create(owner);
        String firstTab = service.rotate(key).rawToken();
        String secondTab = service.rotate(key).rawToken();

        assertThat(firstTab).isNotEqualTo(secondTab);
        RefreshSession old = byHash.values().stream().filter(s -> s.getExpiresAt().isBefore(LocalDateTime.now().plusMinutes(1))).findFirst().orElseThrow();
        assertThat(old.getExpiresAt()).isBefore(LocalDateTime.now().plusSeconds(31));
    }

    private static User user(String email, String password) {
        return User.builder().email(email).username("jan").password(password).build();
    }
}
