-- One-time backfill: for any resident with advance_paid > 0 but NO matching
-- 'advance' payment record yet (set directly on the old Add Resident form,
-- before payments were logged for it), create one payment row dated their
-- join_date so the dashboard's period totals can finally see this money.
-- Safe to run once — anyone who already has an advance payment record is skipped.
INSERT INTO payments (pg_id, resident_id, amount, payment_date, payment_mode, payment_type, collected_by, reference_note)
SELECT res.pg_id, res.id, res.advance_paid, res.join_date, 'cash', 'advance', 'Backfill', 'Backfilled — advance set before payment tracking existed'
FROM residents res
WHERE res.advance_paid > 0
  AND res.id NOT IN (SELECT resident_id FROM payments WHERE payment_type = 'advance');
