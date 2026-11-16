--liquibase formatted sql

--changeset courser:030-user-accent-color
ALTER TABLE users
    ADD COLUMN accent_color VARCHAR(16) NOT NULL DEFAULT 'coral';
