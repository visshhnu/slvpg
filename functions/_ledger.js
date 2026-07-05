// functions/_ledger.js
//
// THE single shared accounting utility. Every screen (Rent tab, Residents
// tab, Dashboard) and every payment-mutating endpoint (create/edit/void/
// delete a payment, resolve a correction) reads and writes rent/advance
// balances through the functions here. Before this file existed, rent.js,
// residents.js, payments/[id].js and corrections/[id].js each had their own
// copy of "what does this resident owe" logic, and they disagreed:
// payments/[id].js's recompute summed ALL payment types (not just 'rent')
// into rent_ledger, while corrections/[id].js's recompute filtered to
// 'rent' only, and neither of them ever touched residents.advance_paid at
// all. There is now exactly one formula for each figure.

export const POSTED = 'posted';
export const PAYMENT_STATUSES = ['posted', 'deleted', 'voided', 'refunded'];

// Make sure every resident who has actually moved in by `month` has a
// rent_ledger row for it. Deliberately does NOT use `status IN ('active',
// 'notice_given')` alone -- a bed can be assigned (status='active') to a
// resident whose join_date is still in the future ("Booked -- moves in
// 10 Jul"), and that resident must not be billed rent for the current
// month just because a bed is reserved for them.
//
// Two separate conditions are both needed here, not one:
//  - `join_date <= today`     -- they must have actually moved in by now.
//    This is the one that matters for the CURRENT month: a resident who
//    joins on the 10th of this same month must not get a rent_ledger row
//    (due the 5th!) created on the 6th, or it reads as already overdue
//    before they've even arrived.
//  - `join_date's month <= the month being billed` -- so ensureLedgerRows
//    called for a future month (e.g. Rent tab paged forward) doesn't skip
//    a resident who will have joined by then just because today hasn't
//    caught up to that month yet.
export async function ensureLedgerRows(env, pgId, month) {
  const today = new Date().toISOString().slice(0, 10);
  const isRealCurrentMonth = month === today.slice(0, 7);
  const { results: dueResidents } = await env.DB.prepare(`
    SELECT res.id, res.custom_rent, r.monthly_rent
    FROM residents res
    JOIN beds b ON b.id = res.bed_id
    JOIN rooms r ON r.id = b.room_id
    WHERE res.pg_id = ? AND res.status IN ('active', 'notice_given')
      AND substr(res.join_date, 1, 7) <= ?
      AND res.join_date <= ?
  `).bind(pgId, month, today).all();

  const dueDate = `${month}-05`;

  for (const res of dueResidents) {
    // custom_rent (per-bed override) wins over the room's shared monthly_rent
    const expectedAmount = res.custom_rent != null ? res.custom_rent : res.monthly_rent;

    const existing = await env.DB.prepare(
      'SELECT id, amount_due FROM rent_ledger WHERE resident_id = ? AND month = ?'
    ).bind(res.id, month).first();

    if (!existing) {
      await env.DB.prepare(
        `INSERT INTO rent_ledger (pg_id, resident_id, month, due_date, amount_due, status)
         VALUES (?, ?, ?, ?, ?, 'pending')`
      ).bind(pgId, res.id, month, dueDate, expectedAmount).run();
    } else if (isRealCurrentMonth && existing.amount_due !== expectedAmount) {
      // The room's monthly_rent or the resident's custom_rent was edited
      // AFTER this month's ledger row was already created -- that row was a
      // one-time snapshot and never re-synced on its own. Only self-heal the
      // real, still-open current month (never a past month someone is just
      // viewing on the Rent tab) so a closed month's history never shifts.
      await recomputeRentLedgerRow(env, existing.id, expectedAmount);
    }
  }
}

// Re-derives one rent_ledger row's amount_paid/status against a given
// amount_due (which may have just changed), off the payments actually
// linked to it. Shared by ensureLedgerRows' self-heal and
// recomputeResidentLedger below, so there is exactly one formula.
async function recomputeRentLedgerRow(env, rentLedgerId, amountDue) {
  const sum = await env.DB.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total FROM payments
    WHERE rent_ledger_id = ? AND payment_type = 'rent' AND status = ?
  `).bind(rentLedgerId, POSTED).first();

  const paid = Math.min(sum.total, amountDue);
  const status = paid >= amountDue ? 'paid' : paid > 0 ? 'partial' : 'pending';

  await env.DB.prepare(
    'UPDATE rent_ledger SET amount_due = ?, amount_paid = ?, status = ? WHERE id = ?'
  ).bind(amountDue, paid, status, rentLedgerId).run();
}

// Re-derives every rent_ledger row and residents.advance_paid for one
// resident, from scratch, off the payments table -- the only source of
// truth. Call this after a payment is created, edited, voided, refunded or
// deleted. Nothing else may write to rent_ledger.amount_paid/status or
// residents.advance_paid -- those columns are a cache of this computation,
// never incremented/decremented in place (that drift is exactly what let a
// deleted payment keep counting toward a resident's balance).
export async function recomputeResidentLedger(env, residentId) {
  const { results: ledgerRows } = await env.DB.prepare(
    'SELECT id, amount_due FROM rent_ledger WHERE resident_id = ?'
  ).bind(residentId).all();

  for (const row of ledgerRows) {
    await recomputeRentLedgerRow(env, row.id, row.amount_due);
  }

  const advanceSum = await env.DB.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total FROM payments
    WHERE resident_id = ? AND payment_type = 'advance' AND status = ?
  `).bind(residentId, POSTED).first();

  await env.DB.prepare(
    'UPDATE residents SET advance_paid = ? WHERE id = ?'
  ).bind(advanceSum.total, residentId).run();
}

// "Overdue" is a function of today's date, not a stored fact -- deriving it
// here once (instead of duplicating the `today > due_date` check in both
// rent.js and residents.js) is what keeps the two screens from being able
// to disagree about it.
export function deriveRentStatus(ledgerRow, todayStr) {
  if (!ledgerRow) return 'not_due';
  let status = ledgerRow.status;
  if ((status === 'pending' || status === 'partial') && ledgerRow.due_date && todayStr > ledgerRow.due_date) {
    status = 'overdue';
  }
  return status;
}

// One shared shape + status vocabulary for the advance deposit, so Rent
// tab, Residents tab and Dashboard describe the same balance the same way.
export function deriveAdvanceState(expected, paid) {
  expected = expected || 0;
  paid = paid || 0;
  const balance = expected - paid;
  let status;
  if (expected <= 0) status = 'not_applicable';
  else if (paid <= 0) status = 'pending';
  else if (balance > 0) status = 'partial';
  else if (balance < 0) status = 'overpaid';
  else status = 'paid';
  return { expected, paid, balance, status };
}

// Consistent display copy for rent/advance statuses, shared by both
// screens so the same state is never worded two different ways.
export const RENT_STATUS_LABELS = {
  not_due: 'Move-in scheduled',
  pending: 'Rent due',
  partial: 'Rent partial',
  paid: 'Rent paid',
  overdue: 'Rent overdue',
};

export const ADVANCE_STATUS_LABELS = {
  not_applicable: '',
  pending: 'Advance pending',
  partial: 'Advance partial',
  paid: 'Advance paid',
  overpaid: 'Advance overpaid',
};
