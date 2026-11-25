--liquibase formatted sql

--changeset courser:018-quiz-origin-and-play-options
ALTER TABLE quizzes
    ADD COLUMN origin_quiz_id BIGINT,
    ADD COLUMN random_question_order BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN show_correct_answers BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE quiz_attempts
    ADD COLUMN origin_quiz_id BIGINT;

UPDATE quiz_attempts
SET origin_quiz_id = quiz_id
WHERE origin_quiz_id IS NULL;

ALTER TABLE quiz_attempts
    ALTER COLUMN origin_quiz_id SET NOT NULL;

ALTER TABLE quiz_attempts
    DROP CONSTRAINT fk_quiz_attempts_quiz_id;

ALTER TABLE quiz_attempts
    ALTER COLUMN quiz_id DROP NOT NULL;

ALTER TABLE quiz_attempts
    ADD CONSTRAINT fk_quiz_attempts_quiz_id FOREIGN KEY (quiz_id) REFERENCES quizzes (id) ON DELETE SET NULL;

CREATE INDEX idx_quiz_attempts_origin_user_status ON quiz_attempts (origin_quiz_id, user_id, status);
