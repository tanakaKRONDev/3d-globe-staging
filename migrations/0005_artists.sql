-- Artists table: each artist gets their own subdomain + branding
CREATE TABLE IF NOT EXISTS artists (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  accent_color TEXT NOT NULL DEFAULT '#E7D1A7',
  accent_muted TEXT,
  accent_dark TEXT,
  logo_url TEXT,
  site_password TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_artists_slug ON artists(slug);

-- Link stops to artists (nullable = belongs to default/platform)
ALTER TABLE stops ADD COLUMN artist_id TEXT REFERENCES artists(id);

CREATE INDEX IF NOT EXISTS idx_stops_artist_id ON stops(artist_id);
