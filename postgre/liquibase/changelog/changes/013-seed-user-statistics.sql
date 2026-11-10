--liquibase formatted sql

-- Demonstration activity for the seeded Szymon account. Empty dates deliberately
-- have no row: the dashboard interprets them as days without activity (zero).
--changeset courser:029-seed-szymon-statistics context:seed
WITH calendar AS (
    SELECT
        day::date AS activity_date,
        EXTRACT(ISODOW FROM day)::integer AS weekday,
        EXTRACT(WEEK FROM day)::integer AS week_number,
        EXTRACT(DOY FROM day)::integer AS day_of_year
    FROM generate_series(DATE '2025-05-12', DATE '2026-11-10', INTERVAL '1 day') AS day
),
activity AS (
    SELECT
        activity_date,
        CASE WHEN weekday = 5 AND MOD(week_number, 4) = 0 THEN 2 ELSE 1 END AS completed_quizzes,
        8 + MOD(day_of_year * 3 + week_number, 22) AS checked_questions,
        5500 + MOD(day_of_year * 41 + week_number * 17, 4001) AS effectiveness_hundredths
    FROM calendar
    WHERE weekday IN (1, 3, 5)
       OR (weekday = 6 AND MOD(week_number, 3) = 0)
)
INSERT INTO user_daily_statistics (
    user_id,
    activity_date,
    completed_quizzes,
    checked_questions,
    effectiveness_sum,
    effectiveness_count
)
SELECT
    users.id,
    activity.activity_date,
    activity.completed_quizzes,
    activity.checked_questions,
    activity.effectiveness_hundredths * activity.completed_quizzes,
    activity.completed_quizzes
FROM users
CROSS JOIN activity
WHERE users.email = 'szymon@gmail.com'
ON CONFLICT (user_id, activity_date) DO NOTHING;
