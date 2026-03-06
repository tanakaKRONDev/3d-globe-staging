-- IP blocking: store blocked IPs with scope (admin | all) and optional note
CREATE TABLE IF NOT EXISTS ip_blocks (
  ip TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK(scope IN ('admin','all')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  note TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_ip_blocks_scope ON ip_blocks(scope);
CREATE INDEX IF NOT EXISTS idx_ip_blocks_updated_at ON ip_blocks(updated_at);
