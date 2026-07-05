-- migrations/0009_payment_status_integrity.sql
-- Payment lifecycle integrity.
--
-- Before this migration, deleting or editing a payment only ever touched
-- rent_ledger (via ad-hoc, duplicated recompute logic in two different
-- files) and NEVER touched residents.advance_paid -- advance_paid was a
-- running counter that only ever went up (incremented on insert), never
-- corrected on delete/edit. That is why a deleted advance payment kept
-- showing up as "overpaid" forever: the counter was never told the money
-- it counted no longer existed.
--
-- Fix: payments are now soft-deleted (status moves to 'deleted'/'voided'/
-- 'refunded' instead of the row disappearing), and both rent_ledger and
-- residents.advance_paid are always fully RE-DERIVED from the payments
-- table by functions/_ledger.js -- never incremented/decremented in place.

ALTER TABLE payments ADD COLUMN status TEXT NOT NULL DEFAULT 'posted';
ALTER TABLE payments ADD COLUMN status_note TEXT;
ALTER TABLE payments ADD COLUMN status_by TEXT;
ALTER TABLE payments ADD COLUMN status_at TEXT;

CREATE INDEX idx_payments_status ON payments(status);

-- One-time backfill: correct any drift that already exists in production data
-- (e.g. Ajay's advance_paid still reflecting a payment that was deleted
-- under the old hard-delete code, before this migration ever ran).
UPDATE residents SET advance_paid = (
  SELECT COALESCE(SUM(amount), 0) FROM payments
  WHERE payments.resident_id = residents.id
    AND payments.payment_type = 'advance'
    AND payments.status = 'posted'
);

UPDATE rent_ledger SET amount_paid = MIN(
  rent_ledger.amount_due,
  (SELECT COALESCE(SUM(amount), 0) FROM payments
   WHERE payments.rent_ledger_id = rent_ledger.id
     AND payments.payment_type = 'rent'
     AND payments.status = 'posted')
);

UPDATE rent_ledger SET status = CASE
  WHEN amount_paid >= amount_due THEN 'paid'
  WHEN amount_paid > 0 THEN 'partial'
  ELSE 'pending'
END;
