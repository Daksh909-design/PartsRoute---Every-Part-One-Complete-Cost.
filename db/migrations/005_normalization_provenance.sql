ALTER TABLE observations ADD COLUMN normalization_version text;
ALTER TABLE observations ADD COLUMN normalized_at timestamptz;
