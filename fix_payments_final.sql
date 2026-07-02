-- ============================================================
-- Final targeted payment corrections — run ONCE
-- ============================================================

-- 1) Sakti: rent_ledger stuck at ₹10,000 paid because payment was
--    deleted via wrangler directly (bypassed API recompute). Reset it.
UPDATE rent_ledger SET amount_paid = 0, status = 'pending' WHERE id = 6;

-- 2) Mohammed Imdad: duplicate advance row (restore script ran twice)
DELETE FROM payments WHERE id = 29;

-- 3) Vaugunth: wrong ₹13,500 rent backfill — id=1 (Durga Pratima, Phonepay)
--    already covers his real rent of ₹10,500. Delete the duplicate.
DELETE FROM payments WHERE id = 16;

-- 4) Vaugunth: advance backfill amount was ₹2,000 but should be ₹5,000
UPDATE payments SET amount = 5000 WHERE id = 15;
UPDATE residents SET advance_paid = 5000 WHERE phone = '6381238635';

-- 5) C Pavan: advance was entered as ₹3,000 but should be ₹10,000
UPDATE payments SET amount = 10000 WHERE id = 20;
UPDATE residents SET advance_paid = 10000 WHERE phone = '9989929460';

-- 6) C Pavan: rent backfill was ₹18,000 but should be ₹11,000
--    (id=27 Phonepay ₹500 by Durga Pratima is kept as a real payment)
UPDATE payments SET amount = 11000 WHERE id = 21;

-- 7) Recompute Vaugunth and C Pavan's June rent_ledger from actual payments
--    (Sakti's was already reset above manually since it had no payments at all)
UPDATE rent_ledger SET
  amount_paid = (
    SELECT COALESCE(SUM(p.amount), 0) FROM payments p
    WHERE p.rent_ledger_id = rent_ledger.id AND p.payment_type = 'rent'
  ),
  status = CASE
    WHEN (SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.rent_ledger_id = rent_ledger.id AND p.payment_type = 'rent') >= amount_due THEN 'paid'
    WHEN (SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.rent_ledger_id = rent_ledger.id AND p.payment_type = 'rent') > 0 THEN 'partial'
    ELSE 'pending'
  END
WHERE resident_id IN (
  SELECT id FROM residents WHERE phone IN ('6381238635', '9989929460')
) AND month = '2026-06';
