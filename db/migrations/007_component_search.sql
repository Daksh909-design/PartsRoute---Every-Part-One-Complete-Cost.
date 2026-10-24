CREATE TABLE IF NOT EXISTS component_searches (
  id uuid PRIMARY KEY,
  actor text NOT NULL,
  query text NOT NULL,
  original jsonb NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS component_searches_actor_time ON component_searches(actor,created_at DESC);
