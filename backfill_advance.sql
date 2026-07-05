-- =====================================================================
-- *** DO NOT RUN -- SUPERSEDED AND DELIBERATELY UNDONE ***
--
-- Every row this script ever inserted was later deleted on purpose by
-- cleanup_old_backfill.sql (confirmed by audit 2026-07-06: no payment in
-- the live database currently matches this script's signature). Its own
-- `NOT IN` guard below no longer protects against anything meaningful --
-- re-running it would resurrect exactly the rows that were intentionally
-- removed, silently re-inflating every affected resident's advance total.
-- Kept only as a historical record of what backfill_v2.sql replaced.
-- =====================================================================
--
-- Original one-time backfill: for any resident with advance_paid > 0 but
-- NO matching 'advance' payment record yet (set directly on the old Add
-- Resident form, before payments were logged for it), create one payment
-- row dated their join_date so the dashboard's period totals could see it.
INSERT INTO payments (pg_id, resident_id, amount, payment_date, payment_mode, payment_type, collected_by, reference_note)
SELECT res.pg_id, res.id, res.advance_paid, res.join_date, 'cash', 'advance', 'Backfill', 'Backfilled — advance set before payment tracking existed'
FROM residents res
WHERE res.advance_paid > 0
  AND res.id NOT IN (SELECT resident_id FROM payments WHERE payment_type = 'advance');
