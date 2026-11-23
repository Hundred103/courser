package net.edu.courser.user.dto;

public record LoginResponse(Long id, String email, String username, String accentColor, String token) {}
