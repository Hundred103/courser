package pl.ku1son.user.security;

public record JwtClaims(Long userId, String email, String username) {
}
