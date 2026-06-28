-- Migration 0004: Corrections, check-in receipts, ID documents
-- Safe additive migration - only adds new tables/columns, doesn't touch existing data.

-- A "flag" raised by staff on a payment or expense they believe is wrong.
-- Staff can never delete the underlying record directly -- they raise a flag here,
-- admin reviews it and decides what to do (edit the original, or dismiss the flag).
CREATE TABLE corrections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pg_id INTEGER NOT NULL REFERENCES pgs(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL,        -- 'payment' or 'expense'
  record_id INTEGER NOT NULL,       -- id of the payments or expenses row in question
  raised_by TEXT NOT NULL,          -- staff name who flagged it
  reason TEXT NOT NULL,             -- what they think is wrong / what it should be
  status TEXT NOT NULL DEFAULT 'open',  -- 'open', 'resolved', 'dismissed'
  resolved_by TEXT,
  resolution_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);

-- Check-in receipt: a locked, point-in-time snapshot taken when a resident moves in.
-- Once created it is never edited by the app -- if something needs correcting,
-- a new receipt version is created instead, and the old one stays on record as-is.
CREATE TABLE checkin_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pg_id INTEGER NOT NULL REFERENCES pgs(id) ON DELETE CASCADE,
  resident_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  receipt_number TEXT NOT NULL UNIQUE,   -- e.g. SLVPG-2026-0001, human-friendly + sequential
  room_floor TEXT NOT NULL,
  room_number TEXT NOT NULL,
  bed_label TEXT NOT NULL,
  sharing_type TEXT NOT NULL,
  join_date TEXT NOT NULL,
  monthly_rent INTEGER NOT NULL,
  advance_deposit INTEGER NOT NULL,
  refundable_amount INTEGER NOT NULL,
  advance_paid_now INTEGER NOT NULL,
  room_condition_snapshot TEXT NOT NULL,  -- JSON array of facility items + condition, frozen at check-in time
  terms_snapshot TEXT NOT NULL,           -- the house rules / terms text shown to the resident, frozen at this moment
  generated_by TEXT NOT NULL,             -- staff/admin name who generated it
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_corrections_pg ON corrections(pg_id);
CREATE INDEX idx_corrections_status ON corrections(status);
CREATE INDEX idx_checkin_receipts_resident ON checkin_receipts(resident_id);
CREATE INDEX idx_checkin_receipts_pg ON checkin_receipts(pg_id);

-- ID document photo storage (small images stored as base64 data URLs - fine at D1's
-- free-tier scale for a single PG's worth of resident documents).
ALTER TABLE residents ADD COLUMN aadhaar_photo_url TEXT;
ALTER TABLE residents ADD COLUMN pan_number TEXT;
ALTER TABLE residents ADD COLUMN pan_photo_url TEXT;
ALTER TABLE residents ADD COLUMN id_proof_photo_url TEXT;
