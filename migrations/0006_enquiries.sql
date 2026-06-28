-- Migration 0006: Enquiries inbox
-- Stores room booking enquiries submitted from the public property page.
-- Safe additive migration — new table only.
CREATE TABLE enquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pg_id INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  room_type TEXT,
  move_in_date TEXT,
  occupation TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'new',  -- 'new', 'contacted', 'converted', 'not_interested'
  notes TEXT,                           -- staff notes after follow-up
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_enquiries_pg ON enquiries(pg_id);
CREATE INDEX idx_enquiries_status ON enquiries(status);
