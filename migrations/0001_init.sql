-- SVPG Management System database schema
-- Multi-PG aware: one admin can see all PGs, staff are scoped to one PG.
-- SQLite (Cloudflare D1)

-- Properties (PGs). One row per PG you manage.
CREATE TABLE pgs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  address TEXT,
  contact_phone TEXT,
  landlord_name TEXT,
  landlord_phone TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Staff / login accounts.
-- pg_id = NULL means this account is an admin and can see/manage every PG.
-- pg_id = a real id means this staff member is locked to that one PG.
CREATE TABLE staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pg_id INTEGER REFERENCES pgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff',   -- 'admin' or 'staff'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Rooms (one row per room, per floor, per PG)
CREATE TABLE rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pg_id INTEGER NOT NULL REFERENCES pgs(id) ON DELETE CASCADE,
  floor TEXT NOT NULL,
  room_number TEXT NOT NULL,
  sharing_type TEXT NOT NULL,      -- 'single' or 'double'
  capacity INTEGER NOT NULL,
  monthly_rent INTEGER NOT NULL,
  advance_deposit INTEGER NOT NULL,
  refundable_amount INTEGER NOT NULL,
  needs_maintenance INTEGER NOT NULL DEFAULT 0,
  maintenance_note TEXT,
  notes TEXT,
  UNIQUE(pg_id, floor, room_number)
);

-- Beds within a room (handles double sharing as 2 separate beds)
CREATE TABLE beds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  bed_label TEXT NOT NULL,
  UNIQUE(room_id, bed_label)
);

-- Room facility / asset inventory (per room) - bed, mattress, fan, geyser, etc.
CREATE TABLE room_facilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,          -- 'Bed','Mattress','Pillow','Cupboard','Chair','Study Table','Fan','Geyser','Light','Bucket','Mug','Attached Bathroom', etc.
  quantity INTEGER NOT NULL DEFAULT 1,
  condition TEXT NOT NULL DEFAULT 'good',  -- 'good','damaged','missing'
  notes TEXT
);

-- Residents (hostellers)
CREATE TABLE residents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pg_id INTEGER NOT NULL REFERENCES pgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  photo_url TEXT,
  phone TEXT NOT NULL,
  alt_phone TEXT,
  aadhaar_number TEXT,
  id_proof_type TEXT,
  id_proof_number TEXT,
  occupation TEXT,
  company_or_college TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  bed_id INTEGER REFERENCES beds(id) ON DELETE SET NULL,
  join_date TEXT NOT NULL,
  advance_paid INTEGER NOT NULL DEFAULT 0,
  agreement_signed INTEGER NOT NULL DEFAULT 0,
  agreement_url TEXT,
  police_verification_status TEXT NOT NULL DEFAULT 'pending',  -- 'pending','submitted','verified'
  status TEXT NOT NULL DEFAULT 'active',  -- 'active', 'notice_given', 'vacated'
  notice_date TEXT,
  planned_vacate_date TEXT,
  actual_vacate_date TEXT,
  room_inspection_done INTEGER NOT NULL DEFAULT 0,
  room_inspection_notes TEXT,
  deductions INTEGER NOT NULL DEFAULT 0,
  deduction_reason TEXT,
  refund_paid INTEGER,
  refund_paid_date TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Monthly rent ledger - one row generated per resident per month
CREATE TABLE rent_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pg_id INTEGER NOT NULL REFERENCES pgs(id) ON DELETE CASCADE,
  resident_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  month TEXT NOT NULL,             -- 'YYYY-MM'
  due_date TEXT NOT NULL,
  amount_due INTEGER NOT NULL,
  amount_paid INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending','partial','paid','overdue'
  UNIQUE(resident_id, month)
);

-- Individual payment transactions (rent income FROM residents)
CREATE TABLE payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pg_id INTEGER NOT NULL REFERENCES pgs(id) ON DELETE CASCADE,
  rent_ledger_id INTEGER REFERENCES rent_ledger(id) ON DELETE CASCADE,
  resident_id INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  payment_date TEXT NOT NULL DEFAULT (date('now')),
  payment_mode TEXT,
  payment_type TEXT NOT NULL DEFAULT 'rent', -- 'rent','advance','refund'
  collected_by TEXT,
  reference_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Expenses (every outflow: groceries, milk, electricity, water, wifi, landlord rent, salary, maintenance, etc.)
CREATE TABLE expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pg_id INTEGER NOT NULL REFERENCES pgs(id) ON DELETE CASCADE,
  category TEXT NOT NULL,          -- see CATEGORY list in app - groceries, milk, electricity, water, wifi, landlord_rent, salary, maintenance, repairs, cleaning, other
  description TEXT,
  amount INTEGER NOT NULL,
  expense_date TEXT NOT NULL DEFAULT (date('now')),
  paid_by TEXT,
  receipt_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_rooms_pg ON rooms(pg_id);
CREATE INDEX idx_residents_pg ON residents(pg_id);
CREATE INDEX idx_residents_status ON residents(status);
CREATE INDEX idx_residents_bed ON residents(bed_id);
CREATE INDEX idx_rent_ledger_pg ON rent_ledger(pg_id);
CREATE INDEX idx_rent_ledger_month ON rent_ledger(month);
CREATE INDEX idx_rent_ledger_status ON rent_ledger(status);
CREATE INDEX idx_payments_pg ON payments(pg_id);
CREATE INDEX idx_payments_resident ON payments(resident_id);
CREATE INDEX idx_expenses_pg ON expenses(pg_id);
CREATE INDEX idx_expenses_date ON expenses(expense_date);
CREATE INDEX idx_staff_pg ON staff(pg_id);
