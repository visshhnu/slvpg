-- PG Manager database schema
-- Built for Sri Lakshmi Venkateshwara Luxury Co-Living PG
-- SQLite (Cloudflare D1)

-- Staff / login accounts (you + wardens)
CREATE TABLE staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff',   -- 'owner' or 'staff'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Rooms (one row per room, per floor)
CREATE TABLE rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  floor TEXT NOT NULL,             -- 'Ground', '1st', '2nd', ... '6th'
  room_number TEXT NOT NULL,       -- e.g. 'G-1', '1-3'
  sharing_type TEXT NOT NULL,      -- 'single' or 'double'
  capacity INTEGER NOT NULL,       -- 1 or 2
  monthly_rent INTEGER NOT NULL,   -- per-bed rent
  advance_deposit INTEGER NOT NULL,
  refundable_amount INTEGER NOT NULL,
  notes TEXT,
  UNIQUE(floor, room_number)
);

-- Beds within a room (handles double sharing as 2 separate beds)
CREATE TABLE beds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  bed_label TEXT NOT NULL,         -- 'A' or 'B' (or just 'A' for single)
  UNIQUE(room_id, bed_label)
);

-- Residents (hostellers)
CREATE TABLE residents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  alt_phone TEXT,
  id_proof_type TEXT,              -- Aadhar / Passport / College ID etc
  id_proof_number TEXT,
  occupation TEXT,                 -- student / working professional
  company_or_college TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  bed_id INTEGER REFERENCES beds(id) ON DELETE SET NULL,
  join_date TEXT NOT NULL,
  advance_paid INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',  -- 'active', 'notice_given', 'vacated'
  notice_date TEXT,                -- when they informed
  planned_vacate_date TEXT,        -- the date they intend to leave
  actual_vacate_date TEXT,
  refund_paid INTEGER,
  refund_paid_date TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Monthly rent ledger - one row generated per resident per month
CREATE TABLE rent_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resident_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  month TEXT NOT NULL,             -- 'YYYY-MM'
  due_date TEXT NOT NULL,          -- usually 5th of month
  amount_due INTEGER NOT NULL,
  amount_paid INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending','partial','paid','overdue'
  UNIQUE(resident_id, month)
);

-- Individual payment transactions (a rent_ledger row can have multiple part-payments)
CREATE TABLE payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rent_ledger_id INTEGER REFERENCES rent_ledger(id) ON DELETE CASCADE,
  resident_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  payment_date TEXT NOT NULL DEFAULT (date('now')),
  payment_mode TEXT,               -- 'cash','upi','bank_transfer'
  payment_type TEXT NOT NULL DEFAULT 'rent', -- 'rent','advance','refund'
  collected_by TEXT,               -- staff name
  reference_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Expenses (money going out)
CREATE TABLE expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,          -- 'electricity','maintenance','salary','groceries','wifi','water','other'
  description TEXT,
  amount INTEGER NOT NULL,
  expense_date TEXT NOT NULL DEFAULT (date('now')),
  paid_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_residents_status ON residents(status);
CREATE INDEX idx_residents_bed ON residents(bed_id);
CREATE INDEX idx_rent_ledger_month ON rent_ledger(month);
CREATE INDEX idx_rent_ledger_status ON rent_ledger(status);
CREATE INDEX idx_payments_resident ON payments(resident_id);
CREATE INDEX idx_expenses_date ON expenses(expense_date);
