package net.edu.courser.quizservice.repository;
import net.edu.courser.quizservice.entity.RankingUser;
import org.springframework.data.jpa.repository.JpaRepository;
public interface RankingUserRepository extends JpaRepository<RankingUser, Long> {}
