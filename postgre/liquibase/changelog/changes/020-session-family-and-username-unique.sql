--liquibase formatted sql

--changeset courser:058-refresh-session-family
ALTER TABLE refresh_sessions
    ADD COLUMN family_id UUID;

UPDATE refresh_sessions
SET family_id = id
WHERE family_id IS NULL;

ALTER TABLE refresh_sessions
    ALTER COLUMN family_id SET NOT NULL;

CREATE INDEX idx_refresh_sessions_family_id ON refresh_sessions (family_id);

--changeset courser:059-username-case-insensitive-unique
-- Keep the oldest row per lower(username); rename later collisions to alphanumeric u{id}
-- so validateUsername / navbar settings still accept the name.
UPDATE users u
SET username = 'u' || u.id::text
WHERE u.id IN (
    SELECT id
    FROM (
        SELECT id,
               row_number() OVER (PARTITION BY lower(username) ORDER BY id) AS rn
        FROM users
    ) ranked
    WHERE rn > 1
);

ALTER TABLE users DROP CONSTRAINT IF EXISTS uk_r43af9ap4edm43mmtq01oddj6;

CREATE UNIQUE INDEX uk_users_username_lower ON users (lower(username));
