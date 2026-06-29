package pl.edu.pg.roadsign.gateway.security;

public record JwtClaims(Long userId, String email, String username) {
}
