--liquibase formatted sql

-- Demo account + 3 sample quizzes (Geografia, Informatyka, Historia),
-- a month of home-page statistics relative to the migration day,
-- and ranking placements for the example user.
-- Enable with: LIQUIBASE_CONTEXTS=seed (fresh database only).

--changeset courser:049-seed-demo-user context:seed
INSERT INTO users (id, created_at, email, password, username, accent_color)
VALUES (
    1,
    CURRENT_TIMESTAMP,
    'example@email.com',
    '$2a$10$pqfr4Tpg4ibYr.76gcOaF.M0hsm9wZ8dVCjZoEtY7fpHwylPIY51y',
    'example',
    'coral'
);

--changeset courser:050-seed-demo-ranking-versions context:seed
INSERT INTO quiz_ranking_versions (id, snapshot_json, content_hash, has_logged_import, created_at)
VALUES ('11111111-1111-4111-8111-111111111111', '{"title":"Geografia","questions":[{"content":"Jaka jest stolica Polski?","answers":[{"content":"Kraków","correct":false,"points":null},{"content":"Warszawa","correct":true,"points":null},{"content":"Gdańsk","correct":false,"points":null},{"content":"Wrocław","correct":false,"points":null}],"image":null},{"content":"Który kontynent jest największy?","answers":[{"content":"Afryka","correct":false,"points":null},{"content":"Europa","correct":false,"points":null},{"content":"Azja","correct":true,"points":null},{"content":"Australia","correct":false,"points":null}],"image":null},{"content":"Jak nazywa się najdłuższa rzeka świata?","answers":[{"content":"Amazonka","correct":true,"points":null},{"content":"Wisła","correct":false,"points":null},{"content":"Nil","correct":false,"points":null},{"content":"Odra","correct":false,"points":null}],"image":null},{"content":"Które państwo ma kształt buta?","answers":[{"content":"Hiszpania","correct":false,"points":null},{"content":"Włochy","correct":true,"points":null},{"content":"Francja","correct":false,"points":null},{"content":"Norwegia","correct":false,"points":null}],"image":null},{"content":"Jakie morze leży nad Polską?","answers":[{"content":"Morze Czarne","correct":false,"points":null},{"content":"Morze Śródziemne","correct":false,"points":null},{"content":"Morze Bałtyckie","correct":true,"points":null},{"content":"Morze Północne","correct":false,"points":null}],"image":null},{"content":"Która planeta jest nazywana Czerwoną Planetą?","answers":[{"content":"Mars","correct":true,"points":null},{"content":"Wenus","correct":false,"points":null},{"content":"Jowisz","correct":false,"points":null},{"content":"Saturn","correct":false,"points":null}],"image":null},{"content":"Który ocean jest największy?","answers":[{"content":"Ocean Atlantycki","correct":false,"points":null},{"content":"Ocean Indyjski","correct":false,"points":null},{"content":"Ocean Arktyczny","correct":false,"points":null},{"content":"Ocean Spokojny","correct":true,"points":null}],"image":null},{"content":"Jak nazywa się najwyższy szczyt świata?","answers":[{"content":"K2","correct":false,"points":null},{"content":"Mount Everest","correct":true,"points":null},{"content":"Rysy","correct":false,"points":null},{"content":"Mont Blanc","correct":false,"points":null}],"image":null},{"content":"W jakim kraju znajdują się piramidy w Gizie?","answers":[{"content":"Grecja","correct":false,"points":null},{"content":"Turcja","correct":false,"points":null},{"content":"Egipt","correct":true,"points":null},{"content":"Indie","correct":false,"points":null}],"image":null},{"content":"Które państwo słynie z miasta Tokio?","answers":[{"content":"Chiny","correct":false,"points":null},{"content":"Korea Południowa","correct":false,"points":null},{"content":"Japonia","correct":true,"points":null},{"content":"Tajlandia","correct":false,"points":null}],"image":null}],"scoring":{"mode":"default","allowNegativeScore":false,"pointsPerCorrect":1.0,"incorrectPenalty":1.0,"penaltyMode":"fraction"},"limits":{"randomQuestionOrder":false,"showCorrectAnswers":true}}', 'dad5c79623d4887dce2b0d27c190fbdfa026def907a1c6e15bbe3a6d3b218bdc', FALSE, CURRENT_TIMESTAMP);

INSERT INTO quiz_ranking_versions (id, snapshot_json, content_hash, has_logged_import, created_at)
VALUES ('22222222-2222-4222-8222-222222222222', '{"title":"Informatyka","questions":[{"content":"Które urządzenie służy do wyświetlania obrazu?","answers":[{"content":"Klawiatura","correct":false,"points":null},{"content":"Monitor","correct":true,"points":null},{"content":"Myszka","correct":false,"points":null},{"content":"Drukarka","correct":false,"points":null}],"image":null},{"content":"Który system operacyjny stworzyła firma Microsoft?","answers":[{"content":"Linux","correct":false,"points":null},{"content":"Windows","correct":true,"points":null},{"content":"macOS","correct":false,"points":null},{"content":"Android","correct":false,"points":null}],"image":null},{"content":"Jak nazywa się podstawowa część komputera odpowiedzialna za obliczenia?","answers":[{"content":"Procesor","correct":true,"points":null},{"content":"Monitor","correct":false,"points":null},{"content":"Głośnik","correct":false,"points":null},{"content":"Pendrive","correct":false,"points":null}],"image":null},{"content":"Który program służy do przeglądania internetu?","answers":[{"content":"Excel","correct":false,"points":null},{"content":"Word","correct":false,"points":null},{"content":"Chrome","correct":true,"points":null},{"content":"Paint","correct":false,"points":null}],"image":null},{"content":"Jak nazywa się urządzenie używane do wpisywania tekstu?","answers":[{"content":"Myszka","correct":false,"points":null},{"content":"Klawiatura","correct":true,"points":null},{"content":"Skaner","correct":false,"points":null},{"content":"Router","correct":false,"points":null}],"image":null},{"content":"Który język programowania jest często używany do stron internetowych?","answers":[{"content":"HTML","correct":false,"points":null},{"content":"Java","correct":false,"points":null},{"content":"Python","correct":false,"points":null},{"content":"JavaScript","correct":true,"points":null}],"image":null},{"content":"Jak nazywa się pamięć używana do przechowywania plików?","answers":[{"content":"Dysk twardy","correct":true,"points":null},{"content":"Procesor","correct":false,"points":null},{"content":"Karta graficzna","correct":false,"points":null},{"content":"Wentylator","correct":false,"points":null}],"image":null},{"content":"Które urządzenie pozwala połączyć się z internetem bezprzewodowo?","answers":[{"content":"Router","correct":true,"points":null},{"content":"Drukarka","correct":false,"points":null},{"content":"Monitor","correct":false,"points":null},{"content":"Projektor","correct":false,"points":null}],"image":null},{"content":"Jak nazywa się małe przenośne urządzenie do przechowywania danych USB?","answers":[{"content":"Tablet","correct":false,"points":null},{"content":"Pendrive","correct":true,"points":null},{"content":"Laptop","correct":false,"points":null},{"content":"Mikrofon","correct":false,"points":null}],"image":null},{"content":"Która firma stworzyła iPhone''a?","answers":[{"content":"Samsung","correct":false,"points":null},{"content":"Google","correct":false,"points":null},{"content":"Apple","correct":true,"points":null},{"content":"Intel","correct":false,"points":null}],"image":null}],"scoring":{"mode":"default","allowNegativeScore":false,"pointsPerCorrect":1.0,"incorrectPenalty":1.0,"penaltyMode":"fraction"},"limits":{"randomQuestionOrder":false,"showCorrectAnswers":true}}', '03049a0dad5b44cced24fbb2ee886fb52df9405113bf0012e0da4ffdb1d2f697', FALSE, CURRENT_TIMESTAMP);

INSERT INTO quiz_ranking_versions (id, snapshot_json, content_hash, has_logged_import, created_at)
VALUES ('33333333-3333-4333-8333-333333333333', '{"title":"Historia","questions":[{"content":"Które wydarzenia są związane z II wojną światową?","answers":[{"content":"Atak Niemiec na Polskę w 1939 roku","correct":true,"points":null},{"content":"Bitwa pod Grunwaldem","correct":false,"points":null},{"content":"Lądowanie aliantów w Normandii","correct":true,"points":null},{"content":"Zrzucenie bomb atomowych na Hiroszimę i Nagasaki","correct":true,"points":null}],"image":null},{"content":"Które wydarzenia miały miejsce w starożytności?","answers":[{"content":"Powstanie Cesarstwa Rzymskiego","correct":true,"points":null},{"content":"Budowa piramid w Egipcie","correct":true,"points":null},{"content":"Odkrycie Ameryki przez Kolumba","correct":false,"points":null},{"content":"Rewolucja francuska","correct":false,"points":null}],"image":null},{"content":"Które wydarzenia są związane z okresem średniowiecza?","answers":[{"content":"Chrzest Polski","correct":true,"points":null},{"content":"Bitwa pod Grunwaldem","correct":true,"points":null},{"content":"Wybuch I wojny światowej","correct":false,"points":null},{"content":"Lądowanie człowieka na Księżycu","correct":false,"points":null}],"image":null},{"content":"W którym roku Polska odzyskała niepodległość?","answers":[{"content":"1918","correct":true,"points":null},{"content":"1795","correct":false,"points":null},{"content":"1945","correct":false,"points":null}],"image":null},{"content":"Kto był pierwszym koronowanym królem Polski?","answers":[{"content":"Bolesław Chrobry","correct":true,"points":null},{"content":"Kazimierz Wielki","correct":false,"points":null},{"content":"Władysław Jagiełło","correct":false,"points":null}],"image":null}],"scoring":{"mode":"default","allowNegativeScore":false,"pointsPerCorrect":1.0,"incorrectPenalty":1.0,"penaltyMode":"fraction"},"limits":{"randomQuestionOrder":false,"showCorrectAnswers":true}}', '741282fdbae7cc85cc81650d905d623e0a1839ed7d5606fe880b65ad45aa4e15', FALSE, CURRENT_TIMESTAMP);

--changeset courser:051-seed-demo-quizzes context:seed
INSERT INTO quizzes (
    id, title, owner_user_id, ranking_version_id,
    scoring_mode, allow_negative_score, points_per_correct, incorrect_penalty, penalty_mode,
    random_question_order, show_correct_answers
) VALUES
    (1, 'Geografia', 1, '11111111-1111-4111-8111-111111111111', 'DEFAULT', FALSE, 1, 1, 'FRACTION', FALSE, TRUE),
    (2, 'Informatyka', 1, '22222222-2222-4222-8222-222222222222', 'DEFAULT', FALSE, 1, 1, 'FRACTION', FALSE, TRUE),
    (3, 'Historia', 1, '33333333-3333-4333-8333-333333333333', 'DEFAULT', FALSE, 1, 1, 'FRACTION', FALSE, TRUE);

--changeset courser:052-seed-demo-questions context:seed
INSERT INTO questions (id, content, quiz_id, image_key) VALUES
    (1, 'Jaka jest stolica Polski?', 1, NULL),
    (2, 'Który kontynent jest największy?', 1, NULL),
    (3, 'Jak nazywa się najdłuższa rzeka świata?', 1, NULL),
    (4, 'Które państwo ma kształt buta?', 1, NULL),
    (5, 'Jakie morze leży nad Polską?', 1, NULL),
    (6, 'Która planeta jest nazywana Czerwoną Planetą?', 1, NULL),
    (7, 'Który ocean jest największy?', 1, NULL),
    (8, 'Jak nazywa się najwyższy szczyt świata?', 1, NULL),
    (9, 'W jakim kraju znajdują się piramidy w Gizie?', 1, NULL),
    (10, 'Które państwo słynie z miasta Tokio?', 1, NULL),
    (11, 'Które urządzenie służy do wyświetlania obrazu?', 2, NULL),
    (12, 'Który system operacyjny stworzyła firma Microsoft?', 2, NULL),
    (13, 'Jak nazywa się podstawowa część komputera odpowiedzialna za obliczenia?', 2, NULL),
    (14, 'Który program służy do przeglądania internetu?', 2, NULL),
    (15, 'Jak nazywa się urządzenie używane do wpisywania tekstu?', 2, NULL),
    (16, 'Który język programowania jest często używany do stron internetowych?', 2, NULL),
    (17, 'Jak nazywa się pamięć używana do przechowywania plików?', 2, NULL),
    (18, 'Które urządzenie pozwala połączyć się z internetem bezprzewodowo?', 2, NULL),
    (19, 'Jak nazywa się małe przenośne urządzenie do przechowywania danych USB?', 2, NULL),
    (20, 'Która firma stworzyła iPhone''a?', 2, NULL),
    (21, 'Które wydarzenia są związane z II wojną światową?', 3, NULL),
    (22, 'Które wydarzenia miały miejsce w starożytności?', 3, NULL),
    (23, 'Które wydarzenia są związane z okresem średniowiecza?', 3, NULL),
    (24, 'W którym roku Polska odzyskała niepodległość?', 3, NULL),
    (25, 'Kto był pierwszym koronowanym królem Polski?', 3, NULL);

--changeset courser:053-seed-demo-answers context:seed
INSERT INTO answers (id, content, correct, question_id, points) VALUES
    (1, 'Kraków', FALSE, 1, NULL),
    (2, 'Warszawa', TRUE, 1, NULL),
    (3, 'Gdańsk', FALSE, 1, NULL),
    (4, 'Wrocław', FALSE, 1, NULL),
    (5, 'Afryka', FALSE, 2, NULL),
    (6, 'Europa', FALSE, 2, NULL),
    (7, 'Azja', TRUE, 2, NULL),
    (8, 'Australia', FALSE, 2, NULL),
    (9, 'Amazonka', TRUE, 3, NULL),
    (10, 'Wisła', FALSE, 3, NULL),
    (11, 'Nil', FALSE, 3, NULL),
    (12, 'Odra', FALSE, 3, NULL),
    (13, 'Hiszpania', FALSE, 4, NULL),
    (14, 'Włochy', TRUE, 4, NULL),
    (15, 'Francja', FALSE, 4, NULL),
    (16, 'Norwegia', FALSE, 4, NULL),
    (17, 'Morze Czarne', FALSE, 5, NULL),
    (18, 'Morze Śródziemne', FALSE, 5, NULL),
    (19, 'Morze Bałtyckie', TRUE, 5, NULL),
    (20, 'Morze Północne', FALSE, 5, NULL),
    (21, 'Mars', TRUE, 6, NULL),
    (22, 'Wenus', FALSE, 6, NULL),
    (23, 'Jowisz', FALSE, 6, NULL),
    (24, 'Saturn', FALSE, 6, NULL),
    (25, 'Ocean Atlantycki', FALSE, 7, NULL),
    (26, 'Ocean Indyjski', FALSE, 7, NULL),
    (27, 'Ocean Arktyczny', FALSE, 7, NULL),
    (28, 'Ocean Spokojny', TRUE, 7, NULL),
    (29, 'K2', FALSE, 8, NULL),
    (30, 'Mount Everest', TRUE, 8, NULL),
    (31, 'Rysy', FALSE, 8, NULL),
    (32, 'Mont Blanc', FALSE, 8, NULL),
    (33, 'Grecja', FALSE, 9, NULL),
    (34, 'Turcja', FALSE, 9, NULL),
    (35, 'Egipt', TRUE, 9, NULL),
    (36, 'Indie', FALSE, 9, NULL),
    (37, 'Chiny', FALSE, 10, NULL),
    (38, 'Korea Południowa', FALSE, 10, NULL),
    (39, 'Japonia', TRUE, 10, NULL),
    (40, 'Tajlandia', FALSE, 10, NULL),
    (41, 'Klawiatura', FALSE, 11, NULL),
    (42, 'Monitor', TRUE, 11, NULL),
    (43, 'Myszka', FALSE, 11, NULL),
    (44, 'Drukarka', FALSE, 11, NULL),
    (45, 'Linux', FALSE, 12, NULL),
    (46, 'Windows', TRUE, 12, NULL),
    (47, 'macOS', FALSE, 12, NULL),
    (48, 'Android', FALSE, 12, NULL),
    (49, 'Procesor', TRUE, 13, NULL),
    (50, 'Monitor', FALSE, 13, NULL),
    (51, 'Głośnik', FALSE, 13, NULL),
    (52, 'Pendrive', FALSE, 13, NULL),
    (53, 'Excel', FALSE, 14, NULL),
    (54, 'Word', FALSE, 14, NULL),
    (55, 'Chrome', TRUE, 14, NULL),
    (56, 'Paint', FALSE, 14, NULL),
    (57, 'Myszka', FALSE, 15, NULL),
    (58, 'Klawiatura', TRUE, 15, NULL),
    (59, 'Skaner', FALSE, 15, NULL),
    (60, 'Router', FALSE, 15, NULL),
    (61, 'HTML', FALSE, 16, NULL),
    (62, 'Java', FALSE, 16, NULL),
    (63, 'Python', FALSE, 16, NULL),
    (64, 'JavaScript', TRUE, 16, NULL),
    (65, 'Dysk twardy', TRUE, 17, NULL),
    (66, 'Procesor', FALSE, 17, NULL),
    (67, 'Karta graficzna', FALSE, 17, NULL),
    (68, 'Wentylator', FALSE, 17, NULL),
    (69, 'Router', TRUE, 18, NULL),
    (70, 'Drukarka', FALSE, 18, NULL),
    (71, 'Monitor', FALSE, 18, NULL),
    (72, 'Projektor', FALSE, 18, NULL),
    (73, 'Tablet', FALSE, 19, NULL),
    (74, 'Pendrive', TRUE, 19, NULL),
    (75, 'Laptop', FALSE, 19, NULL),
    (76, 'Mikrofon', FALSE, 19, NULL),
    (77, 'Samsung', FALSE, 20, NULL),
    (78, 'Google', FALSE, 20, NULL),
    (79, 'Apple', TRUE, 20, NULL),
    (80, 'Intel', FALSE, 20, NULL),
    (81, 'Atak Niemiec na Polskę w 1939 roku', TRUE, 21, NULL),
    (82, 'Bitwa pod Grunwaldem', FALSE, 21, NULL),
    (83, 'Lądowanie aliantów w Normandii', TRUE, 21, NULL),
    (84, 'Zrzucenie bomb atomowych na Hiroszimę i Nagasaki', TRUE, 21, NULL),
    (85, 'Powstanie Cesarstwa Rzymskiego', TRUE, 22, NULL),
    (86, 'Budowa piramid w Egipcie', TRUE, 22, NULL),
    (87, 'Odkrycie Ameryki przez Kolumba', FALSE, 22, NULL),
    (88, 'Rewolucja francuska', FALSE, 22, NULL),
    (89, 'Chrzest Polski', TRUE, 23, NULL),
    (90, 'Bitwa pod Grunwaldem', TRUE, 23, NULL),
    (91, 'Wybuch I wojny światowej', FALSE, 23, NULL),
    (92, 'Lądowanie człowieka na Księżycu', FALSE, 23, NULL),
    (93, '1918', TRUE, 24, NULL),
    (94, '1795', FALSE, 24, NULL),
    (95, '1945', FALSE, 24, NULL),
    (96, 'Bolesław Chrobry', TRUE, 25, NULL),
    (97, 'Kazimierz Wielki', FALSE, 25, NULL),
    (98, 'Władysław Jagiełło', FALSE, 25, NULL);

--changeset courser:054-seed-demo-ranking-entries context:seed
INSERT INTO quiz_ranking_entries (
    ranking_version_id, user_id, score_scaled, max_score_scaled, duration_ms, completed_at
) VALUES
    ('11111111-1111-4111-8111-111111111111', 1, 900, 1000, 185432, CURRENT_TIMESTAMP - INTERVAL '2 days'),
    ('22222222-2222-4222-8222-222222222222', 1, 800, 1000, 241110, CURRENT_TIMESTAMP - INTERVAL '5 days'),
    ('33333333-3333-4333-8333-333333333333', 1, 400, 500, 152000, CURRENT_TIMESTAMP - INTERVAL '9 days');

--changeset courser:055-seed-demo-quiz-summary context:seed
INSERT INTO user_quiz_summary (user_id, quiz_id, completed_count) VALUES
    (1, 1, 4),
    (1, 2, 3),
    (1, 3, 2);

--changeset courser:056-seed-demo-month-statistics context:seed
-- Activity across the last 30 days (including today). Empty calendar days stay empty
-- so the home chart shows real gaps, same idea as the old Szymon seed.
WITH calendar AS (
    SELECT
        day::date AS activity_date,
        EXTRACT(ISODOW FROM day)::integer AS weekday,
        EXTRACT(DAY FROM day)::integer AS day_of_month
    FROM generate_series(CURRENT_DATE - INTERVAL '29 days', CURRENT_DATE, INTERVAL '1 day') AS day
),
activity AS (
    SELECT
        activity_date,
        CASE WHEN weekday = 5 THEN 2 ELSE 1 END AS completed_quizzes,
        6 + MOD(day_of_month * 3 + weekday, 18) AS checked_questions,
        6200 + MOD(day_of_month * 37 + weekday * 13, 3301) AS effectiveness_hundredths
    FROM calendar
    WHERE weekday IN (1, 2, 4, 5)
       OR (weekday = 6 AND MOD(day_of_month, 2) = 0)
)
INSERT INTO user_daily_statistics (
    user_id, activity_date, completed_quizzes, checked_questions,
    effectiveness_sum, effectiveness_count
)
SELECT
    1,
    activity_date,
    completed_quizzes,
    checked_questions,
    effectiveness_hundredths * completed_quizzes,
    completed_quizzes
FROM activity;

--changeset courser:057-seed-demo-sequences context:seed
SELECT setval('users_id_seq', GREATEST((SELECT MAX(id) FROM users), 1));
SELECT setval('quizzes_id_seq', GREATEST((SELECT MAX(id) FROM quizzes), 1));
SELECT setval('questions_id_seq', GREATEST((SELECT MAX(id) FROM questions), 1));
SELECT setval('answers_id_seq', GREATEST((SELECT MAX(id) FROM answers), 1));
SELECT setval('quiz_ranking_entries_id_seq', GREATEST((SELECT MAX(id) FROM quiz_ranking_entries), 1));
SELECT setval('quiz_share_codes_id_seq', 1, false);
