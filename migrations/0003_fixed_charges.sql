-- Migration 0003: Fixed Charges reference list
-- A simple per-PG list of standard recurring costs (landlord rent, wifi, etc.)
-- that the admin can set/update anytime. NOT auto-billed -- purely a reference
-- so nobody has to remember "what's our current wifi rate" from memory.
-- Safe to run on an existing live database: only adds a new table, touches nothing else.

CREATE TABLE fixed_charges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pg_id INTEGER NOT NULL REFERENCES pgs(id) ON DELETE CASCADE,
  label TEXT NOT NULL,             -- e.g. 'Rent to Landlord', 'Wi-Fi Plan', 'Water Tanker'
  category TEXT NOT NULL,          -- matches expense categories so "Log This Month" pre-fills correctly
  amount INTEGER NOT NULL,
  notes TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(pg_id, label)
);

CREATE INDEX idx_fixed_charges_pg ON fixed_charges(pg_id);
