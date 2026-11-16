--liquibase formatted sql

--changeset courser:026-user-daily-statistics
CREATE TABLE user_daily_statistics (
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_date DATE NOT NULL,
    completed_quizzes BIGINT NOT NULL DEFAULT 0,
    checked_questions BIGINT NOT NULL DEFAULT 0,
    effectiveness_sum BIGINT NOT NULL DEFAULT 0,
    effectiveness_count BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, activity_date)
);

--changeset courser:027-user-quiz-summary
CREATE TABLE user_quiz_summary (
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    quiz_id BIGINT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    completed_count BIGINT NOT NULL DEFAULT 0,
    best_score INTEGER,
    best_max_score INTEGER,
    PRIMARY KEY (user_id, quiz_id)
);

-- Short-lived retry keys contain no answers or results. They are removed after 7 days.
--changeset courser:028-statistics-retry-keys
CREATE TABLE user_statistics_retry_keys (
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, request_id)
);
CREATE INDEX idx_statistics_retry_keys_created ON user_statistics_retry_keys(created_at);
