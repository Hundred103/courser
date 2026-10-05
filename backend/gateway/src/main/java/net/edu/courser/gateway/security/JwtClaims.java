package net.edu.courser.gateway.security;

public record JwtClaims(Long userId, String email, String username) {
}
