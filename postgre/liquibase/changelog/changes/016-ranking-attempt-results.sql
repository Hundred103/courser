--liquibase formatted sql

--changeset courser:032-ranking-attempt-results
ALTER TABLE quiz_ranking_attempts
    ADD COLUMN score_scaled INTEGER,
    ADD COLUMN max_score_scaled INTEGER,
    ADD COLUMN duration_ms BIGINT,
    ADD COLUMN position INTEGER,
    ADD COLUMN outside_top_five BOOLEAN;
