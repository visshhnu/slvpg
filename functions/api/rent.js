// functions/api/rent.js
import { requireAuth, jsonResponse, unauthorized, resolvePgId } from '../_auth.js';
import { ensureLedgerRows, deriveRentStatus } from '../_ledger.js';

export async function onRequestGet({ request, env }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const pgId = resolvePgId(session, url);
  if (!pgId) return jsonResponse({ error: 'pg_id is required' }, 400);

  const month = url.searchParams.get('month') || new Date().toISOString().slice(0, 7);

  // Auto-create ledger rows for all active residents who don't have one yet
  await ensureLedgerRows(env, pgId, month);

  // IMPORTANT: this starts FROM residents, not FROM rent_ledger. A resident
  // who joins later in the year correctly has no ledger row for this month
  // (no rent due yet) — but they still need to show up here so their advance
  // deposit instalments can be tracked. Starting from rent_ledger (the old
  // way) made future-joining residents disappear from this page entirely,
  // hiding their advance tracker and forcing staff to log advance payments
  // through the rent "Collect" button instead — which then wrongly counted
  // booking deposits as rent collected.
  const { results } = await env.DB.prepare(`
    SELECT
      rl.id, rl.amount_due, rl.amount_paid, rl.status, rl.due_date,
      res.id as resident_id, res.name as resident_name, res.phone as resident_phone,
      res.status as resident_status, res.advance_paid, res.join_date,
      r.floor, r.room_number, r.advance_deposit, r.refundable_amount,
      b.bed_label
    FROM residents res
    LEFT JOIN rent_ledger rl ON rl.resident_id = res.id AND rl.month = ?
    LEFT JOIN beds b ON b.id = res.bed_id
    LEFT JOIN rooms r ON r.id = b.room_id
    WHERE res.pg_id = ? AND res.status IN ('active', 'notice_given')
    ORDER BY r.floor, r.room_number, b.bed_label
  `).bind(month, pgId).all();

  const today = new Date().toISOString().slice(0, 10);

  // For each row, also fetch the individual payment transactions for this month
  const enriched = [];
  for (const row of results) {
    // Compute real status (overdue if past 5th and not fully paid). Residents
    // with no ledger row yet (future joiners, no rent due this month) get
    // status 'not_due' so the UI can show them separately, not as "pending".
    // deriveRentStatus is the single shared implementation of this -- the
    // same one residents.js uses -- so the two screens can't disagree.
    const status = row.id ? deriveRentStatus(row, today) : 'not_due';

    // Fetch payment history for this ledger row (none if row.id is null).
    // Only 'posted' payments -- a deleted/voided one shouldn't reappear here.
    const { results: payments } = row.id
      ? await env.DB.prepare(`
          SELECT id, amount, payment_mode, payment_type, payment_date, reference_note, collected_by
          FROM payments
          WHERE rent_ledger_id = ? AND status = 'posted'
          ORDER BY payment_date ASC, created_at ASC
        `).bind(row.id).all()
      : { results: [] };

    enriched.push({ ...row, status, payments });
  }

  // Sort: overdue first, then partial, then pending, then not_due, then paid
  const order = { overdue: 0, partial: 1, pending: 2, not_due: 3, paid: 4 };
  enriched.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));

  const billedRows = enriched.filter(r => r.id); // only rows with an actual rent due this month count toward totals
  const summary = {
    month,
    total_due: billedRows.reduce((s, r) => s + r.amount_due, 0),
    total_paid: billedRows.reduce((s, r) => s + r.amount_paid, 0),
    total_pending: billedRows.reduce((s, r) => s + (r.amount_due - r.amount_paid), 0),
    overdue_count: enriched.filter(r => r.status === 'overdue').length,
    partial_count: enriched.filter(r => r.status === 'partial').length,
    advance_total_expected: enriched.reduce((s, r) => s + (r.advance_deposit || 0), 0),
    advance_total_paid: enriched.reduce((s, r) => s + (r.advance_paid || 0), 0),
  };

  return jsonResponse({ summary, rows: enriched });
}
