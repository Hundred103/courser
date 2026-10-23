package net.edu.courser.quizservice.entity;
import jakarta.persistence.*;
import lombok.Getter;
@Getter @Entity @Table(name="users")
public class RankingUser { @Id private Long id; @Column(nullable=false) private String username; }
