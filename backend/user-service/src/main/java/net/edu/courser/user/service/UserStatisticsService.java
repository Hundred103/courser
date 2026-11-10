package net.edu.courser.user.service;

import net.edu.courser.user.dto.BestQuizScoreResponse;
import net.edu.courser.user.dto.CompleteStatisticsRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

@Service
public class UserStatisticsService {
    private final JdbcTemplate jdbc;
    public UserStatisticsService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public record DailyStatistics(LocalDate date, long completedQuizzes, long checkedQuestions,
                                  long effectivenessSum, long effectivenessCount) { }

    @Transactional
    public void complete(Long userId, CompleteStatisticsRequest request) {
        if (request == null || request.requestId() == null || request.quizId() == null || request.quizId() <= 0
                || request.checkedQuestions() == null || request.checkedQuestions() < 0
                || request.timeZone() == null || request.timeZone().length() > 100
                || (!request.studyMode() && (request.score() == null || request.maxScore() == null
                || request.maxScore() < 0 || request.score() > request.maxScore() || request.effectivenessHundredths() == null))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nieprawidłowe dane podejścia.");
        }
        ZoneId zone;
        try { zone = ZoneId.of(request.timeZone()); }
        catch (Exception ex) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nieprawidłowa strefa czasowa."); }
        Boolean ownsQuiz = jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM quizzes WHERE id = ? AND owner_user_id = ?)", Boolean.class, request.quizId(), userId);
        if (!Boolean.TRUE.equals(ownsQuiz)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Nie znaleziono quizu.");
        jdbc.update("DELETE FROM user_statistics_retry_keys WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '7 days'");
        int inserted = jdbc.update("INSERT INTO user_statistics_retry_keys(user_id, request_id) VALUES (?, ?) ON CONFLICT DO NOTHING", userId, request.requestId());
        if (inserted == 0) return;
        LocalDate date = LocalDate.now(zone);
        jdbc.update("""
            INSERT INTO user_daily_statistics(user_id, activity_date, completed_quizzes, checked_questions, effectiveness_sum, effectiveness_count)
            VALUES (?, ?, 1, ?, ?, ?)
            ON CONFLICT (user_id, activity_date) DO UPDATE SET
              completed_quizzes = user_daily_statistics.completed_quizzes + 1,
              checked_questions = user_daily_statistics.checked_questions + EXCLUDED.checked_questions,
              effectiveness_sum = user_daily_statistics.effectiveness_sum + EXCLUDED.effectiveness_sum,
              effectiveness_count = user_daily_statistics.effectiveness_count + EXCLUDED.effectiveness_count
            """, userId, date, request.checkedQuestions(), request.studyMode() ? 0 : request.effectivenessHundredths(), request.studyMode() ? 0 : 1);
        jdbc.update("""
            INSERT INTO user_quiz_summary(user_id, quiz_id, completed_count, best_score, best_max_score)
            VALUES (?, ?, 1, ?, ?)
            ON CONFLICT (user_id, quiz_id) DO UPDATE SET
              completed_count = user_quiz_summary.completed_count + 1,
              best_score = CASE WHEN EXCLUDED.best_score IS NOT NULL AND
                (user_quiz_summary.best_score IS NULL OR
                 (CASE WHEN EXCLUDED.best_max_score = 0 THEN EXCLUDED.best_score::double precision ELSE EXCLUDED.best_score::double precision / EXCLUDED.best_max_score END) >=
                 (CASE WHEN user_quiz_summary.best_max_score = 0 THEN user_quiz_summary.best_score::double precision ELSE user_quiz_summary.best_score::double precision / user_quiz_summary.best_max_score END))
                THEN EXCLUDED.best_score ELSE user_quiz_summary.best_score END,
              best_max_score = CASE WHEN EXCLUDED.best_score IS NOT NULL AND
                (user_quiz_summary.best_score IS NULL OR
                 (CASE WHEN EXCLUDED.best_max_score = 0 THEN EXCLUDED.best_score::double precision ELSE EXCLUDED.best_score::double precision / EXCLUDED.best_max_score END) >=
                 (CASE WHEN user_quiz_summary.best_max_score = 0 THEN user_quiz_summary.best_score::double precision ELSE user_quiz_summary.best_score::double precision / user_quiz_summary.best_max_score END))
                THEN EXCLUDED.best_max_score ELSE user_quiz_summary.best_max_score END
            """, userId, request.quizId(), request.studyMode() ? null : request.score(), request.studyMode() ? null : request.maxScore());
    }

    @Transactional(readOnly = true)
    public List<DailyStatistics> daily(Long userId) {
        return jdbc.query("SELECT activity_date, completed_quizzes, checked_questions, effectiveness_sum, effectiveness_count FROM user_daily_statistics WHERE user_id = ? ORDER BY activity_date",
                (rs, n) -> new DailyStatistics(rs.getObject(1, LocalDate.class), rs.getLong(2), rs.getLong(3), rs.getLong(4), rs.getLong(5)), userId);
    }

    @Transactional(readOnly = true)
    public long count(Long userId, Long quizId) {
        List<Long> values = jdbc.query("SELECT completed_count FROM user_quiz_summary WHERE user_id = ? AND quiz_id = ?", (rs, n) -> rs.getLong(1), userId, quizId);
        return values.isEmpty() ? 0 : values.get(0);
    }

    @Transactional(readOnly = true)
    public List<BestQuizScoreResponse> bestScores(Long userId) {
        return jdbc.query("SELECT quiz_id, best_score, best_max_score FROM user_quiz_summary WHERE user_id = ? AND best_score IS NOT NULL",
                (rs, n) -> BestQuizScoreResponse.builder().quizId(rs.getLong(1)).score(rs.getInt(2)).maxScore(rs.getInt(3)).build(), userId);
    }
}
