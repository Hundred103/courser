package net.edu.courser.user.service;

import net.edu.courser.user.dto.CompleteStatisticsRequest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.postgresql.ds.PGSimpleDataSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named = "COURSER_TEST_DATABASE_URL", matches = ".+")
class UserStatisticsServiceIntegrationTest {
    private JdbcTemplate jdbc;
    private UserStatisticsService service;
    private TransactionTemplate transaction;
    private long userId;
    private long quizId;

    @BeforeEach
    void setUp() {
        PGSimpleDataSource source = new PGSimpleDataSource();
        source.setURL(System.getenv("COURSER_TEST_DATABASE_URL"));
        source.setUser("courseruser"); source.setPassword("test");
        jdbc = new JdbcTemplate(source);
        service = new UserStatisticsService(jdbc);
        transaction = new TransactionTemplate(new DataSourceTransactionManager(source));
        String unique = UUID.randomUUID().toString();
        userId = jdbc.queryForObject("INSERT INTO users(email, username, password, role) VALUES (?, ?, 'x', 'STUDENT') RETURNING id", Long.class, unique + "@test.local", unique);
        quizId = jdbc.queryForObject("INSERT INTO quizzes(title, owner_user_id) VALUES ('Test', ?) RETURNING id", Long.class, userId);
    }

    @AfterEach
    void cleanUp() {
        jdbc.update("DELETE FROM quizzes WHERE id = ?", quizId);
        jdbc.update("DELETE FROM users WHERE id = ?", userId);
    }

    @Test
    void aggregatesAndDeduplicatesWhileKeepingStatsAfterQuizDeletion() {
        UUID key = UUID.randomUUID();
        CompleteStatisticsRequest normal = new CompleteStatisticsRequest(key, quizId, 4, false, 800, 1000, 8000, "Europe/Warsaw");
        complete(normal); complete(normal);
        complete(new CompleteStatisticsRequest(UUID.randomUUID(), quizId, 3, true, null, null, null, "Europe/Warsaw"));
        complete(new CompleteStatisticsRequest(UUID.randomUUID(), quizId, 1, false, -200, 1000, -2000, "Europe/Warsaw"));
        var daily = service.daily(userId).get(0);
        assertEquals(3, daily.completedQuizzes());
        assertEquals(8, daily.checkedQuestions());
        assertEquals(6000, daily.effectivenessSum());
        assertEquals(2, daily.effectivenessCount());
        assertEquals(3, service.count(userId, quizId));
        assertEquals(800, service.bestScores(userId).get(0).getScore());
        jdbc.update("DELETE FROM quizzes WHERE id = ?", quizId);
        assertEquals(3, service.daily(userId).get(0).completedQuizzes());
        assertEquals(0, service.count(userId, quizId));
    }

    @Test
    void zeroMaximumContributesZeroToAverage() {
        complete(new CompleteStatisticsRequest(UUID.randomUUID(), quizId, 2, false, 0, 0, 0, "Europe/Warsaw"));
        var daily = service.daily(userId).get(0);
        assertEquals(1, daily.completedQuizzes());
        assertEquals(2, daily.checkedQuestions());
        assertEquals(0, daily.effectivenessSum());
        assertEquals(1, daily.effectivenessCount());
    }

    private void complete(CompleteStatisticsRequest request) {
        transaction.executeWithoutResult(status -> service.complete(userId, request));
    }
}
