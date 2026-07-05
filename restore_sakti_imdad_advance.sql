-- =====================================================================
-- *** ALREADY APPLIED TO PRODUCTION -- DO NOT RUN AGAIN ***
--
-- Restores the two advance payment records the cleanup script removed.
-- These were correctly excluded from backfill_v2.sql ("already correct")
-- but that was only true for residents.advance_paid -- their transaction
-- history (needed for period-based dashboard totals) was wiped by cleanup
-- and never re-added. Dates below are approximate (not given) — correct
-- via Payments admin edit later if you know the real dates.
--
-- Retrofitted 2026-07-06: both INSERTs are now `INSERT OR IGNORE` with an
-- explicit source_import_key, so a second run collides with the unique
-- index in migrations/0010_migration_safety.sql and is a silent no-op
-- instead of inserting these two rows a second time. The amounts are now
-- hardcoded literals (confirmed against the live values these two people
-- actually have: Sakti ₹10,000, Imdad ₹5,000) rather than reading the
-- live `advance_paid` column -- if either of them is later paid MORE
-- advance, that column will grow, and a key built from its new value
-- would no longer match the original row, defeating the unique-index
-- protection. A fixed literal can't drift like that.
-- =====================================================================

INSERT OR IGNORE INTO payments (pg_id, resident_id, amount, payment_date, payment_mode, payment_type, collected_by, reference_note, status, source_import_key)
SELECT pg_id, id, 10000, '2026-06-28', 'cash', 'advance', 'Backfill', 'Restored — date approximate', 'migrated',
  'legacy:' || id || ':advance:10000:2026-06-28'
FROM residents WHERE (phone = '97197140212' OR phone LIKE '9719714021%' OR name LIKE '%Sakti%');

INSERT OR IGNORE INTO payments (pg_id, resident_id, amount, payment_date, payment_mode, payment_type, collected_by, reference_note, status, source_import_key)
SELECT pg_id, id, 5000, '2026-07-01', 'cash', 'advance', 'Backfill', 'Restored — date approximate', 'migrated',
  'legacy:' || id || ':advance:5000:2026-07-01'
FROM residents WHERE phone = '8310289022';
