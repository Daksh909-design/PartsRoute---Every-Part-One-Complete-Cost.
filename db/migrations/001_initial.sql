CREATE TABLE IF NOT EXISTS quotes (
  id uuid PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE,
  input jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('queued','processing','complete','partial','failed')),
  phase text NOT NULL DEFAULT 'Waiting for a worker',
  result jsonb,
  errors jsonb NOT NULL DEFAULT '[]',
  attempts integer NOT NULL DEFAULT 0,
  lease_owner uuid,
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quotes_queue ON quotes(status, created_at);
CREATE TABLE IF NOT EXISTS observations (
  id uuid PRIMARY KEY,
  quote_id uuid NOT NULL REFERENCES quotes(id),
  operation_key text NOT NULL,
  retailer text NOT NULL,
  source_url text NOT NULL,
  method text NOT NULL,
  run_id text,
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  original jsonb NOT NULL,
  normalized jsonb,
  UNIQUE(quote_id, operation_key)
);
CREATE INDEX IF NOT EXISTS observation_cache ON observations(source_url, retrieved_at DESC);
CREATE TABLE IF NOT EXISTS provider_operations (
  quote_id uuid NOT NULL REFERENCES quotes(id),
  operation_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('initiating','running','complete','uncertain')),
  run_id text,
  payload jsonb,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(quote_id, operation_key)
);
CREATE TABLE IF NOT EXISTS provider_usage (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  quote_id uuid NOT NULL REFERENCES quotes(id),
  provider text NOT NULL,
  model text,
  request_id text,
  input_tokens integer,
  output_tokens integer,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS rate_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rate_events_actor ON rate_events(actor,created_at);
