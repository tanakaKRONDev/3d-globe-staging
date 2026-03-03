-- Tour stops table for D1-backed storage
CREATE TABLE IF NOT EXISTS stops (
  id TEXT PRIMARY KEY,
  "order" INTEGER NOT NULL,
  city TEXT NOT NULL,
  country TEXT NOT NULL,
  venue TEXT NOT NULL,
  address TEXT,
  lat REAL,
  lng REAL,
  timeline TEXT,
  notes TEXT,
  capacity TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_stops_order ON stops ("order");
