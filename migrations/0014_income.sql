-- migrations/0014_income.sql
-- For PGs where rent is collected in bulk rather than tracked per-resident
-- (e.g. a leased-out property paying a lump sum), lets that lump sum be
-- logged as real income alongside Expenses -- instead of the only options
-- being "track every resident individually" or "don't record it at all".
CREATE TABLE IF NOT EXISTS income (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pg_id INTEGER NOT NULL REFERENCES pgs(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  income_date TEXT NOT NULL,
  source TEXT,
  description TEXT,
  recorded_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
