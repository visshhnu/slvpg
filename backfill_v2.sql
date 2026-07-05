-- =====================================================================
-- *** ALREADY APPLIED TO PRODUCTION -- DO NOT RUN AGAIN ***
--
-- This file ran once against the live database as a one-time spreadsheet
-- recovery. It is kept here only as a historical record of where that data
-- came from. It is NOT part of migrations/ and wrangler will never track
-- or protect it -- nothing stops a human from executing it a second time
-- with `wrangler d1 execute --file=backfill_v2.sql --remote`.
--
-- Audited 2026-07-06 and retrofitted for safety:
--   - Every INSERT is now `INSERT OR IGNORE` with an explicit
--     source_import_key. A second run collides with the unique index on
--     that column (migrations/0010_migration_safety.sql) and becomes a
--     silent no-op instead of a duplicate.
--   - Three entries below were found, during that audit, to no longer
--     match reality (either factually wrong, or superseded by a later
--     live correction) and have been removed rather than made idempotent
--     -- being a safe no-op on rerun is not the same as being correct, and
--     these specific rows should never be re-inserted in any form:
--       * Arun Kumar's ₹1,000 advance (originally item 2) -- a staff
--         member later hand-corrected his real advance to ₹7,000
--         directly on the live payment row; re-inserting the original
--         ₹1,000 figure would double count on top of that correction.
--       * Ajay's ₹5,000 advance (originally item 4) -- fully superseded
--         by a single real ₹15,000 advance payment entered live on
--         2026-07-05; re-inserting this would leave him wrongly showing
--         ₹20,000 paid against a ₹15,000 deposit.
--       * C. Pavan's ₹11,000 June rent (part of original item 8) -- he
--         joined 1 Jul 2026 and was never a resident in June, so he never
--         owed June rent at all. This exact row was already soft-deleted
--         (payments.status='deleted') during the 2026-07-06 audit; his
--         advance portion below is unaffected and still correct.
-- =====================================================================

-- 1) Yogesh Kumar — correct join date: sheet says "27th joined", not 1 Jul
--    (idempotent on its own: setting the same date twice is harmless)
UPDATE residents SET join_date = '2026-06-27'
WHERE name LIKE '%Yogesh%' AND join_date != '2026-06-27';

-- 2) Arun Kumar — REMOVED. See header: superseded by a hand-corrected
--    ₹7,000 live payment. Do not re-add the original ₹1,000 entry.

-- 3) Vaugunth — advance ₹5,000 (full), 22 June 2026.
--    (The ₹10,500 June rent portion of this item was superseded by a live
--    "Durga Pratima" rent payment and has been removed from this file.)
INSERT OR IGNORE INTO payments (pg_id, resident_id, amount, payment_date, payment_mode, payment_type, collected_by, reference_note, status, source_import_key)
SELECT pg_id, id, 5000, '2026-06-22', 'cash', 'advance', 'Backfill', 'Backfilled from spreadsheet', 'migrated',
  'legacy:' || id || ':advance:5000:2026-06-22'
FROM residents WHERE phone = '6381238635';

UPDATE residents SET advance_paid = (
  SELECT COALESCE(SUM(amount), 0) FROM payments
  WHERE payments.resident_id = residents.id AND payment_type = 'advance' AND status IN ('posted', 'migrated')
) WHERE phone = '6381238635';

-- 4) Ajay / Ajay raja pandiyan — REMOVED. See header: fully superseded by
--    a real ₹15,000 advance payment entered live on 2026-07-05.

-- 5) Yogesh Kumar — ₹10,000 advance, 27 June 2026
INSERT OR IGNORE INTO payments (pg_id, resident_id, amount, payment_date, payment_mode, payment_type, collected_by, reference_note, status, source_import_key)
SELECT pg_id, id, 10000, '2026-06-27', 'cash', 'advance', 'Backfill', 'Backfilled from spreadsheet', 'migrated',
  'legacy:' || id || ':advance:10000:2026-06-27'
FROM residents WHERE name LIKE '%Yogesh%';

UPDATE residents SET advance_paid = (
  SELECT COALESCE(SUM(amount), 0) FROM payments
  WHERE payments.resident_id = residents.id AND payment_type = 'advance' AND status IN ('posted', 'migrated')
) WHERE name LIKE '%Yogesh%';

-- 6) Dinkar Sharma — ₹5,000 advance (date approximate)
INSERT OR IGNORE INTO payments (pg_id, resident_id, amount, payment_date, payment_mode, payment_type, collected_by, reference_note, status, source_import_key)
SELECT pg_id, id, 5000, '2026-06-30', 'cash', 'advance', 'Backfill', 'Backfilled from spreadsheet — date approximate', 'migrated',
  'legacy:' || id || ':advance:5000:2026-06-30'
FROM residents WHERE phone = '9717882017';

UPDATE residents SET advance_paid = (
  SELECT COALESCE(SUM(amount), 0) FROM payments
  WHERE payments.resident_id = residents.id AND payment_type = 'advance' AND status IN ('posted', 'migrated')
) WHERE phone = '9717882017';

-- 7) Adit Garg — ₹5,000 advance (date approximate)
INSERT OR IGNORE INTO payments (pg_id, resident_id, amount, payment_date, payment_mode, payment_type, collected_by, reference_note, status, source_import_key)
SELECT pg_id, id, 5000, '2026-06-30', 'cash', 'advance', 'Backfill', 'Backfilled from spreadsheet — date approximate', 'migrated',
  'legacy:' || id || ':advance:5000:2026-06-30'
FROM residents WHERE phone = '7668134518';

UPDATE residents SET advance_paid = (
  SELECT COALESCE(SUM(amount), 0) FROM payments
  WHERE payments.resident_id = residents.id AND payment_type = 'advance' AND status IN ('posted', 'migrated')
) WHERE phone = '7668134518';

-- 8) C. Pavan — advance ₹10,000 (full), 30 June 2026.
--    (The ₹11,000 rent portion of this item was factually wrong -- see
--    header -- and has been removed from this file entirely.)
INSERT OR IGNORE INTO payments (pg_id, resident_id, amount, payment_date, payment_mode, payment_type, collected_by, reference_note, status, source_import_key)
SELECT pg_id, id, 10000, '2026-06-30', 'upi', 'advance', 'Backfill', 'Phonepay paid', 'migrated',
  'legacy:' || id || ':advance:10000:2026-06-30'
FROM residents WHERE phone = '9989929460';

UPDATE residents SET advance_paid = (
  SELECT COALESCE(SUM(amount), 0) FROM payments
  WHERE payments.resident_id = residents.id AND payment_type = 'advance' AND status IN ('posted', 'migrated')
) WHERE phone = '9989929460';

-- 9) Akshat Rana — ₹5,000 advance (date approximate)
INSERT OR IGNORE INTO payments (pg_id, resident_id, amount, payment_date, payment_mode, payment_type, collected_by, reference_note, status, source_import_key)
SELECT pg_id, id, 5000, '2026-06-30', 'cash', 'advance', 'Backfill', 'Backfilled from spreadsheet — date approximate', 'migrated',
  'legacy:' || id || ':advance:5000:2026-06-30'
FROM residents WHERE phone = '8510098498';

UPDATE residents SET advance_paid = (
  SELECT COALESCE(SUM(amount), 0) FROM payments
  WHERE payments.resident_id = residents.id AND payment_type = 'advance' AND status IN ('posted', 'migrated')
) WHERE phone = '8510098498';

-- 10) Manoj Hansda — ₹15,000 advance (date approximate; this is his full advance)
INSERT OR IGNORE INTO payments (pg_id, resident_id, amount, payment_date, payment_mode, payment_type, collected_by, reference_note, status, source_import_key)
SELECT pg_id, id, 15000, '2026-06-30', 'cash', 'advance', 'Backfill', 'Backfilled from spreadsheet — date approximate', 'migrated',
  'legacy:' || id || ':advance:15000:2026-06-30'
FROM residents WHERE phone = '9717400696';

UPDATE residents SET advance_paid = (
  SELECT COALESCE(SUM(amount), 0) FROM payments
  WHERE payments.resident_id = residents.id AND payment_type = 'advance' AND status IN ('posted', 'migrated')
) WHERE phone = '9717400696';

-- 11) Meyyapan — ₹2,000 advance (date approximate)
INSERT OR IGNORE INTO payments (pg_id, resident_id, amount, payment_date, payment_mode, payment_type, collected_by, reference_note, status, source_import_key)
SELECT pg_id, id, 2000, '2026-06-30', 'cash', 'advance', 'Backfill', 'Backfilled from spreadsheet — date approximate', 'migrated',
  'legacy:' || id || ':advance:2000:2026-06-30'
FROM residents WHERE phone = '8903042799';

UPDATE residents SET advance_paid = (
  SELECT COALESCE(SUM(amount), 0) FROM payments
  WHERE payments.resident_id = residents.id AND payment_type = 'advance' AND status IN ('posted', 'migrated')
) WHERE phone = '8903042799';

-- Sakti and Mohammed Imdad: already correct in the app, intentionally untouched.
-- Veera Kumar: no payment recorded in the spreadsheet, intentionally untouched.
