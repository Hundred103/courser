--liquibase formatted sql

--changeset courser:021-remove-quiz-attempt-limits
DROP TABLE IF EXISTS quiz_attempt_questions;
DROP TABLE IF EXISTS quiz_attempts;

ALTER TABLE quizzes
    DROP CONSTRAINT IF EXISTS quizzes_max_attempts_maximum_check,
    DROP CONSTRAINT IF EXISTS quizzes_quiz_time_seconds_maximum_check,
    DROP CONSTRAINT IF EXISTS quizzes_question_time_seconds_maximum_check,
    DROP CONSTRAINT IF EXISTS quizzes_max_attempts_check,
    DROP CONSTRAINT IF EXISTS quizzes_quiz_time_seconds_check,
    DROP CONSTRAINT IF EXISTS quizzes_question_time_seconds_check;

ALTER TABLE quizzes
    DROP COLUMN IF EXISTS max_attempts,
    DROP COLUMN IF EXISTS quiz_time_seconds,
    DROP COLUMN IF EXISTS question_time_seconds,
    DROP COLUMN IF EXISTS origin_quiz_id;
