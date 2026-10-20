CREATE TABLE extraction_cache (
  cache_key text PRIMARY KEY,
  extraction jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX observation_normalized_cache ON observations(source_url, retrieved_at DESC)
  WHERE normalized IS NOT NULL;
