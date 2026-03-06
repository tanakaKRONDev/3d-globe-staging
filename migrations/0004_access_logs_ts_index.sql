-- Index on timestamp (created_at) for logs range queries when table is large
CREATE INDEX IF NOT EXISTS idx_access_logs_ts ON access_logs(created_at);
