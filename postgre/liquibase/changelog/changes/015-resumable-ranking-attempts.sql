--liquibase formatted sql

--changeset courser:031-resumable-ranking-attempts
ALTER TABLE quiz_ranking_attempts
    ADD COLUMN client_session_id UUID;

-- Istniejące, historyczne podejścia nie były wznawialne. Nadajemy im
-- unikalne identyfikatory, aby bezpiecznie spełnić nowe ograniczenie.
UPDATE quiz_ranking_attempts
SET client_session_id = id
WHERE client_session_id IS NULL;

ALTER TABLE quiz_ranking_attempts
    ALTER COLUMN client_session_id SET NOT NULL;

ALTER TABLE quiz_ranking_attempts
    ADD CONSTRAINT uk_quiz_ranking_attempt_session
        UNIQUE (ranking_version_id, user_id, client_session_id);
