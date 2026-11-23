--liquibase formatted sql

--changeset courser:060-alphanumeric-collision-usernames
-- Repair underscore (or other non-alphanumeric) collision renames from an earlier 020 so settings validation accepts them.
UPDATE users
SET username = 'u' || id::text
WHERE username !~ '^[A-Za-z0-9]+$';
