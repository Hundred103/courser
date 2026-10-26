--liquibase formatted sql

--changeset courser:020-add-quiz-limit-maximums
ALTER TABLE quizzes
    ADD CONSTRAINT quizzes_max_attempts_maximum_check
        CHECK (max_attempts IS NULL OR max_attempts <= 1000);

ALTER TABLE quizzes
    ADD CONSTRAINT quizzes_quiz_time_seconds_maximum_check
        CHECK (quiz_time_seconds IS NULL OR quiz_time_seconds <= 43200);

ALTER TABLE quizzes
    ADD CONSTRAINT quizzes_question_time_seconds_maximum_check
        CHECK (question_time_seconds IS NULL OR question_time_seconds <= 3600);
