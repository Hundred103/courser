--liquibase formatted sql

--changeset courser:040-question-image-media-key
ALTER TABLE questions
    ADD COLUMN image_key VARCHAR(160);

--changeset courser:041-drop-question-image-data
ALTER TABLE questions
    DROP COLUMN image_data;
