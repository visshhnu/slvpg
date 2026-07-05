-- migrations/0010_migration_safety.sql
--
-- Root cause this closes: backfill_v2.sql and restore_sakti_imdad_advance.sql
-- (untracked one-off SQL files in the repo root, run manually via
-- `wrangler d1 execute --file=...`, NOT part of this migrations/ folder)
-- INSERT payment rows with no guard against being run twice. Unlike this
-- migrations/ folder -- which `wrangler d1 migrations apply` tracks in
-- d1_migrations and will never re-apply -- there was nothing stopping
-- someone from re-running one of those files and silently duplicating
-- every historical payment in it again. That is the exact "old payments
-- getting added again" risk being guarded against here.
--
-- Fix has two parts:
--   1. source_import_key + a partial unique index -- a script-imported
--      payment now carries a deterministic key; INSERT OR IGNORE against
--      this index makes a second run of the same script a guaranteed
--      no-op instead of a duplicate. Live, UI-entered payments never set
--      this column, so normal usage can never collide with it.
--   2. A fifth payment lifecycle state, 'migrated', alongside posted/
--      deleted/voided/refunded -- so a script-imported row is visibly
--      distinguishable from a live entry in reports/audits, without
--      changing whether it counts (it does -- it's real historical money).

ALTER TABLE payments ADD COLUMN source_import_key TEXT;

CREATE UNIQUE INDEX idx_payments_source_import_key
  ON payments(source_import_key) WHERE source_import_key IS NOT NULL;

-- Reclassify the payments backfill_v2.sql/backfill_advance.sql already
-- inserted (still 'posted', collected_by='Backfill') to 'migrated', and
-- give each one the exact key its origin script now uses (see the updated
-- backfill_v2.sql/restore_sakti_imdad_advance.sql headers) -- so if either
-- file is ever executed again, the unique index above blocks the re-insert.
-- Deliberately scoped to status='posted' only: a row already soft-deleted
-- during the manual audit (e.g. Pavan's wrongly-dated June payment) stays
-- 'deleted' and is not resurrected as 'migrated' by this statement.
UPDATE payments
SET status = 'migrated',
    source_import_key = 'legacy:' || resident_id || ':' || payment_type || ':' || amount || ':' || payment_date
WHERE collected_by = 'Backfill' AND status = 'posted';
