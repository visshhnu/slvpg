-- Restores the two advance payment records the cleanup script removed.
-- These were correctly excluded from backfill_v2.sql ("already correct")
-- but that was only true for residents.advance_paid — their transaction
-- history (needed for period-based dashboard totals) was wiped by cleanup
-- and never re-added. Dates below are approximate (not given) — correct
-- via Payments admin edit later if you know the real dates.

INSERT INTO payments (pg_id, resident_id, amount, payment_date, payment_mode, payment_type, collected_by, reference_note)
SELECT pg_id, id, advance_paid, '2026-06-28', 'cash', 'advance', 'Backfill', 'Restored — date approximate'
FROM residents WHERE (phone = '97197140212' OR phone LIKE '9719714021%' OR name LIKE '%Sakti%') AND advance_paid > 0;

INSERT INTO payments (pg_id, resident_id, amount, payment_date, payment_mode, payment_type, collected_by, reference_note)
SELECT pg_id, id, advance_paid, '2026-07-01', 'cash', 'advance', 'Backfill', 'Restored — date approximate'
FROM residents WHERE phone = '8310289022' AND advance_paid > 0;
