package net.edu.courser.user.security;

public record JwtClaims(Long userId, String email, String username) {
}
