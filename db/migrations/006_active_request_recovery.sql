ALTER TABLE quotes ADD COLUMN actor text;
CREATE INDEX quotes_active_actor ON quotes(actor) WHERE status IN ('queued','processing');
CREATE TABLE quote_requests (
  request_key text PRIMARY KEY,
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE
);
