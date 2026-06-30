-- =====================================================================
-- Precise backfill based on the real spreadsheet figures (confirmed by
-- owner). DO NOT also run the earlier backfill_advance.sql — skip that
-- one entirely, this replaces it with exact dates instead of guesses.
--
-- For each person: sets residents.advance_paid to the CONFIRMED real
-- total, and inserts one matching payments row dated as told. For the
-- two people who paid rent in full too (Vaugunth, C. Pavan), also logs
-- the rent payment and updates their June rent_ledger row so the Rent
-- tab shows them correctly going forward.
-- =====================================================================

-- 1) Yogesh Kumar — correct join date: sheet says "27th joined", not 1 Jul
--    (this is exactly the scenario the join-date edit feature was built for)
UPDATE residents SET join_date = '2026-06-27'
WHERE name LIKE '%Yogesh%';

-- 2) Arun Kumar — ₹1,000 advance, paid 27 June 2026 (assumed advance; flag if wrong)
UPDATE residents SET advance_paid = 1000 WHERE phone = '8438248404';
INSERT INTO payments (pg_id, resident_id, amount, payment_date, payment_mode, payment_type, collected_by, reference_note)
SELECT pg_id, id, 1000, '2026-06-27', 'cash', 'advance', 'Backfill', 'Backfilled from spreadsheet'
FROM residents WHERE phone = '8438248404';

-- 3) Vaugunth — rent ₹10,500 (full) + advance ₹5,000 (full), both 22 June 2026
UPDATE residents SET advance_paid = 5000 WHERE phone = '6381238635';
INSERT INTO payments (pg_id, resident_id, amount, payment_date, payment_mode, payment_type, collected_by, reference_note)
SELECT pg_id, id, 5000, '2026-06-22', 'cash', 'advance', 'Backfill', 'Backfilled from spreadsheet'
FROM residents WHERE phone = '6381238635';

INSERT INTO rent_ledger (pg_id, resident_id, month, due_date, amount_due, amount_paid, status)
SELECT res.pg_id, res.id, '2026-06', '2026-06-05', COALESCE(res.custom_rent, r.monthly_rent), 0, 'pending'
FROM residents res LEFT JOIN beds b ON b.id = res.bed_id LEFT JOIN rooms r ON r.id = b.room_id
WHERE res.phone = '6381238635'
  AND NOT EXISTS (SELECT 1 FROM rent_ledger WHERE resident_id = res.id AND month = '2026-06');

INSERT INTO payments (pg_id, resident_id, rent_ledger_id, amount, payment_date, payment_mode, payment_type, collected_by, reference_note)
SELECT res.pg_id, res.id, rl.id, 10500, '2026-06-22', 'cash', 'rent', 'Backfill', 'Backfilled from spreadsheet'
FROM residents res JOIN rent_ledger rl ON rl.resident_id = res.id AND rl.month = '2026-06'
WHERE res.phone = '6381238635';

UPDATE rent_ledger SET
  amount_paid = amount_paid + 10500,
  status = CASE WHEN amount_paid + 10500 >= amount_due THEN 'paid' ELSE 'partial' END
WHERE resident_id = (SELECT id FROM residents WHERE phone = '6381238635') AND month = '2026-06';

-- 4) Aijay / Ajay raja pandiyan — ₹5,000 advance, 19 June 2026
UPDATE residents SET advance_paid = 5000 WHERE phone = '9500761400';
INSERT INTO payments (pg_id, resident_id, amount, payment_date, payment_mode, payment_type, collected_by, reference_note)
SELECT pg_id, id, 5000, '2026-06-19', 'cash', 'advance', 'Backfill', 'Backfilled from spreadsheet'
FROM residents WHERE phone = '9500761400';

-- 5) Yogesh Kumar — ₹10,000 advance, 27 June 2026
UPDATE residents SET advance_paid = 10000 WHERE name LIKE '%Yogesh%';
INSERT INTO payments (pg_id, resident_id, amount, payment_date, payment_mode, payment_type, collected_by, reference_note)
SELECT pg_id, id, 10000, '2026-06-27', 'cash', 'advance', 'Backfill', 'Backfilled from spreadsheet'
FROM residents WHERE name LIKE '%Yogesh%';

-- 6) Dinkar Sharma — ₹5,000 advance (no exact date given — using today as a
--    placeholder; correct it later via Payments admin edit if you know the real date)
UPDATE residents SET advance_paid = 5000 WHERE phone = '9717882017';
INSERT INTO payments (pg_id, resident_id, amount, payment_date, payment_mode, payment_type, collected_by, reference_note)
SELECT pg_id, id, 5000, '2026-06-30', 'cash', 'advance', 'Backfill', 'Backfilled from spreadsheet — date approximate'
FROM residents WHERE phone = '9717882017';

-- 7) Adit Garg — ₹5,000 advance (date approximate)
UPDATE residents SET advance_paid = 5000 WHERE phone = '7668134518';
INSERT INTO payments (pg_id, resident_id, amount, payment_date, payment_mode, payment_type, collected_by, reference_note)
SELECT pg_id, id, 5000, '2026-06-30', 'cash', 'advance', 'Backfill', 'Backfilled from spreadsheet — date approximate'
FROM residents WHERE phone = '7668134518';

-- 8) C. Pavan — rent ₹11,000 (full) + advance ₹10,000 (full), both 30 June 2026 (today)
UPDATE residents SET advance_paid = 10000 WHERE phone = '9989929460';
INSERT INTO payments (pg_id, resident_id, amount, payment_date, payment_mode, payment_type, collected_by, reference_note)
SELECT pg_id, id, 10000, '2026-06-30', 'cash', 'advance', 'Backfill', 'Backfilled from spreadsheet'
FROM residents WHERE phone = '9989929460';

INSERT INTO rent_ledger (pg_id, resident_id, month, due_date, amount_due, amount_paid, status)
SELECT res.pg_id, res.id, '2026-06', '2026-06-05', COALESCE(res.custom_rent, r.monthly_rent), 0, 'pending'
FROM residents res LEFT JOIN beds b ON b.id = res.bed_id LEFT JOIN rooms r ON r.id = b.room_id
WHERE res.phone = '9989929460'
  AND NOT EXISTS (SELECT 1 FROM rent_ledger WHERE resident_id = res.id AND month = '2026-06');

INSERT INTO payments (pg_id, resident_id, rent_ledger_id, amount, payment_date, payment_mode, payment_type, collected_by, reference_note)
SELECT res.pg_id, res.id, rl.id, 11000, '2026-06-30', 'cash', 'rent', 'Backfill', 'Backfilled from spreadsheet'
FROM residents res JOIN rent_ledger rl ON rl.resident_id = res.id AND rl.month = '2026-06'
WHERE res.phone = '9989929460';

UPDATE rent_ledger SET
  amount_paid = amount_paid + 11000,
  status = CASE WHEN amount_paid + 11000 >= amount_due THEN 'paid' ELSE 'partial' END
WHERE resident_id = (SELECT id FROM residents WHERE phone = '9989929460') AND month = '2026-06';

-- 9) Akshat Rana — ₹5,000 advance (date approximate)
UPDATE residents SET advance_paid = 5000 WHERE phone = '8510098498';
INSERT INTO payments (pg_id, resident_id, amount, payment_date, payment_mode, payment_type, collected_by, reference_note)
SELECT pg_id, id, 5000, '2026-06-30', 'cash', 'advance', 'Backfill', 'Backfilled from spreadsheet — date approximate'
FROM residents WHERE phone = '8510098498';

-- 10) Manoj Hansda — ₹15,000 advance (date approximate; this is his full advance)
UPDATE residents SET advance_paid = 15000 WHERE phone = '9717400696';
INSERT INTO payments (pg_id, resident_id, amount, payment_date, payment_mode, payment_type, collected_by, reference_note)
SELECT pg_id, id, 15000, '2026-06-30', 'cash', 'advance', 'Backfill', 'Backfilled from spreadsheet — date approximate'
FROM residents WHERE phone = '9717400696';

-- 11) Meyyapan — ₹2,000 advance (date approximate)
UPDATE residents SET advance_paid = 2000 WHERE phone = '8903042799';
INSERT INTO payments (pg_id, resident_id, amount, payment_date, payment_mode, payment_type, collected_by, reference_note)
SELECT pg_id, id, 2000, '2026-06-30', 'cash', 'advance', 'Backfill', 'Backfilled from spreadsheet — date approximate'
FROM residents WHERE phone = '8903042799';

-- Sakti and Mohammed Imdad: already correct in the app, intentionally untouched.
-- Veera Kumar: no payment recorded in the spreadsheet, intentionally untouched.
