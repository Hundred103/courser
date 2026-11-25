-- Gdy właściciel usuwa quiz, jego zwykłe zapisane wyniki nie mogą blokować usunięcia.
-- Ranking pozostaje niezależny od tego powiązania.
--changeset courser:025-cascade-delete-quiz-results
ALTER TABLE quiz_results
    DROP CONSTRAINT fk_quiz_results_quiz_id;

ALTER TABLE quiz_results
    ADD CONSTRAINT fk_quiz_results_quiz_id
        FOREIGN KEY (quiz_id) REFERENCES quizzes (id) ON DELETE CASCADE;
