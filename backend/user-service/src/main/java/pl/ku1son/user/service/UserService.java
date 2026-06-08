package pl.ku1son.user.service;

import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.ku1son.user.entity.User;
import pl.ku1son.user.entity.UserRole;
import pl.ku1son.user.repository.UserRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class UserService {

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
        if (userRepository.existsByEmail(user.getEmail())) {
            throw new RuntimeException("Ten adres e-mail jest już zajęty");
        }
        if (userRepository.existsByUsername(user.getUsername())) {
            throw new RuntimeException("Ta nazwa użytkownika jest już zajęta");
        }
        
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
        
        user.setDisplayName(userDetails.getDisplayName());
        user.setEmail(userDetails.getEmail());
        
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
}
