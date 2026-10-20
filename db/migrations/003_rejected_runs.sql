ALTER TABLE provider_operations DROP CONSTRAINT IF EXISTS provider_operations_status_check;
ALTER TABLE provider_operations ADD CONSTRAINT provider_operations_status_check CHECK (status IN ('initiating','running','complete','uncertain','rejected'));
