-- =====================================================================
-- *** ALREADY APPLIED TO PRODUCTION *** -- safe to run again if needed.
-- A DELETE keyed on an exact, specific signature is naturally idempotent:
-- the matching rows are already gone, so re-running this finds nothing and
-- changes nothing. Kept only as a historical record of what was removed
-- and why (see backfill_advance.sql, which this superseded).
-- =====================================================================
--
-- Removes every row the OLD backfill_advance.sql created, identified by its
-- exact collected_by + reference_note signature, so it's surgical — nothing
-- else in the payments table is touched. Ran BEFORE backfill_v2.sql.
DELETE FROM payments
WHERE collected_by = 'Backfill'
  AND reference_note = 'Backfilled — advance set before payment tracking existed';
