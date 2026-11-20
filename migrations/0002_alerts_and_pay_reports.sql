CREATE TABLE IF NOT EXISTS alert_prefs (
  member_id INTEGER PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  genres TEXT NOT NULL DEFAULT '[]',
  kinds TEXT NOT NULL DEFAULT '[]',
  regions TEXT NOT NULL DEFAULT '[]',
  min_pay_usd REAL NOT NULL DEFAULT 0 CHECK (min_pay_usd >= 0),
  include_unstated_pay INTEGER NOT NULL DEFAULT 1 CHECK (include_unstated_pay IN (0, 1)),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  started_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS alert_sends (
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  call_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('opened', 'deadline_7d', 'deadline_2d')),
  sent_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (member_id, call_id, kind)
);
CREATE TABLE IF NOT EXISTS alert_call_seen (
  call_id TEXT PRIMARY KEY,
  first_seen_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pay_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  outlet_id INTEGER NOT NULL,
  amount REAL NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL CHECK (currency IN ('USD', 'GBP', 'EUR', 'CAD', 'AUD', 'KRW', 'other')),
  unit TEXT NOT NULL CHECK (unit IN ('piece', 'word')),
  piece_type TEXT NOT NULL CHECK (piece_type IN ('review', 'essay', 'interview', 'other')),
  year INTEGER NOT NULL CHECK (year >= 2018),
  usd REAL CHECK (usd > 0),
  ip_hash TEXT NOT NULL,
  outlier INTEGER NOT NULL DEFAULT 0 CHECK (outlier IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS alert_sends_by_call ON alert_sends(call_id, kind);
CREATE INDEX IF NOT EXISTS pay_reports_by_ip ON pay_reports(ip_hash, created_at);
CREATE INDEX IF NOT EXISTS pay_reports_by_outlet ON pay_reports(outlet_id, unit);
