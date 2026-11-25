--liquibase formatted sql

--changeset courser:013-add-quiz-scoring
ALTER TABLE quizzes
    ADD COLUMN scoring_mode VARCHAR(255) NOT NULL DEFAULT 'DEFAULT',
    ADD COLUMN allow_negative_score BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN points_per_correct DOUBLE PRECISION NOT NULL DEFAULT 1,
    ADD COLUMN incorrect_penalty DOUBLE PRECISION NOT NULL DEFAULT 1,
    ADD COLUMN penalty_mode VARCHAR(255) NOT NULL DEFAULT 'FRACTION';

ALTER TABLE quizzes
    ADD CONSTRAINT quizzes_scoring_mode_check CHECK (scoring_mode IN ('DEFAULT', 'CUSTOM'));

ALTER TABLE quizzes
    ADD CONSTRAINT quizzes_penalty_mode_check CHECK (penalty_mode IN ('FRACTION', 'POINTS', 'PERCENT'));

ALTER TABLE quizzes
    ADD CONSTRAINT quizzes_points_per_correct_check CHECK (points_per_correct >= 0);

ALTER TABLE quizzes
    ADD CONSTRAINT quizzes_incorrect_penalty_check CHECK (incorrect_penalty >= 0);

--changeset courser:014-add-answer-points
ALTER TABLE answers
    ADD COLUMN points DOUBLE PRECISION;
