CREATE TABLE IF NOT EXISTS worker_heartbeats (
  worker_id uuid PRIMARY KEY,
  last_seen timestamptz NOT NULL DEFAULT now()
);
