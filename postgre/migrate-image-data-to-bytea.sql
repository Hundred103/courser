-- Migrate image_data from PostgreSQL OID (JPA @Lob) to BYTEA
ALTER TABLE questions ADD COLUMN IF NOT EXISTS image_data_bytea bytea;

UPDATE questions
SET image_data_bytea = lo_get(image_data)
WHERE image_data IS NOT NULL AND image_data_bytea IS NULL;

ALTER TABLE questions DROP COLUMN IF EXISTS image_data;
ALTER TABLE questions RENAME COLUMN image_data_bytea TO image_data;
