-- Index for efficient from/to range queries on access logs
CREATE INDEX IF NOT EXISTS idx_access_logs_created_at ON access_logs(created_at);
