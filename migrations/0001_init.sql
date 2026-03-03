-- Tour stops
CREATE TABLE IF NOT EXISTS stops (
  id TEXT PRIMARY KEY,
  stop_order INTEGER NOT NULL,
  timeline TEXT,
  region TEXT,
  city TEXT NOT NULL,
  country TEXT NOT NULL,
  venue TEXT NOT NULL,
  address TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_stops_order ON stops(stop_order);

-- Snapshot versions for rollback
CREATE TABLE IF NOT EXISTS stop_versions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  snapshot_json TEXT NOT NULL
);

-- Access logs for analytics
CREATE TABLE IF NOT EXISTS access_logs (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  ip TEXT,
  country TEXT,
  region TEXT,
  city TEXT,
  user_agent TEXT,
  path TEXT
);
