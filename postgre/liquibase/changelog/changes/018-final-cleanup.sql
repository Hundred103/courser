--liquibase formatted sql

--changeset courser:042-drop-legacy-result-tables
DROP TABLE IF EXISTS quiz_completed_attempts;
DROP TABLE IF EXISTS quiz_results;

--changeset courser:043-drop-unused-user-columns
ALTER TABLE users
    DROP CONSTRAINT IF EXISTS users_role_check,
    DROP COLUMN IF EXISTS role,
    DROP COLUMN IF EXISTS total_score,
    DROP COLUMN IF EXISTS quizzes_completed,
    DROP COLUMN IF EXISTS last_login;

--changeset courser:044-drop-unused-question-columns
ALTER TABLE questions
    DROP COLUMN IF EXISTS image_filename,
    DROP COLUMN IF EXISTS question_order;

ALTER TABLE answers
    DROP COLUMN IF EXISTS answer_order;

-- Kody sprzed wersji rankingowych wskazywały wyłącznie quiz. Aplikacja nie
-- była jeszcze wdrożona, więc takie kody usuwamy zamiast je przepisywać.
--changeset courser:045-share-codes-require-ranking-version
DELETE FROM quiz_share_codes
WHERE ranking_version_id IS NULL;

ALTER TABLE quiz_share_codes
    DROP CONSTRAINT IF EXISTS fk_quiz_share_codes_quiz_id,
    DROP COLUMN IF EXISTS quiz_id,
    DROP COLUMN IF EXISTS active;

ALTER TABLE quiz_share_codes
    ALTER COLUMN ranking_version_id SET NOT NULL;

-- Kolumna jest NOT NULL, więc usunięcie osieroconej wersji usuwa też jej
-- wygasłe kody (SET NULL naruszyłoby ograniczenie).
ALTER TABLE quiz_share_codes
    DROP CONSTRAINT fk_quiz_share_codes_ranking_version;

ALTER TABLE quiz_share_codes
    ADD CONSTRAINT fk_quiz_share_codes_ranking_version
        FOREIGN KEY (ranking_version_id) REFERENCES quiz_ranking_versions (id) ON DELETE CASCADE;

--changeset courser:046-drop-redundant-ranking-attempt-columns
ALTER TABLE quiz_ranking_attempts
    DROP COLUMN IF EXISTS status,
    DROP COLUMN IF EXISTS outside_top_five;

--changeset courser:047-drop-unused-best-scores
ALTER TABLE user_quiz_summary
    DROP COLUMN IF EXISTS best_score,
    DROP COLUMN IF EXISTS best_max_score;

-- Quiz bez właściciela jest nieosiągalny z API, więc usuwamy go razem z treścią.
--changeset courser:048-quizzes-require-owner-and-title
DELETE FROM answers
WHERE question_id IN (
    SELECT question.id
    FROM questions question
    JOIN quizzes quiz ON quiz.id = question.quiz_id
    WHERE quiz.owner_user_id IS NULL
);

DELETE FROM questions
WHERE quiz_id IN (SELECT id FROM quizzes WHERE owner_user_id IS NULL);

DELETE FROM quizzes
WHERE owner_user_id IS NULL;

UPDATE quizzes
SET title = 'Quiz'
WHERE title IS NULL OR btrim(title) = '';

ALTER TABLE quizzes
    ALTER COLUMN owner_user_id SET NOT NULL,
    ALTER COLUMN title SET NOT NULL;
