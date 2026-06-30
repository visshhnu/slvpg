-- Removes every row the OLD backfill_advance.sql created, identified by its
-- exact collected_by + reference_note signature, so it's surgical — nothing
-- else in the payments table is touched. Run this BEFORE backfill_v2.sql.
DELETE FROM payments
WHERE collected_by = 'Backfill'
  AND reference_note = 'Backfilled — advance set before payment tracking existed';
