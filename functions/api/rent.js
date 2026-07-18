// functions/api/rent.js
import { requireAuth, jsonResponse, unauthorized, resolvePgId } from '../_auth.js';
import { ensureLedgerRows, deriveRentStatus, deriveAdvanceState, detectExceptionsForPg } from '../_ledger.js';

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
  let queryResult;
  try {
    queryResult = await env.DB.prepare(`
      SELECT
        rl.id, rl.amount_due, rl.amount_paid, rl.status, rl.due_date,
        res.id as resident_id, res.name as resident_name, res.phone as resident_phone,
        res.status as resident_status, res.advance_paid, res.join_date, res.custom_advance,
        r.floor, r.room_number, r.advance_deposit, r.refundable_amount,
        b.bed_label
      FROM residents res
      LEFT JOIN rent_ledger rl ON rl.resident_id = res.id AND rl.month = ?
      LEFT JOIN beds b ON b.id = res.bed_id
      LEFT JOIN rooms r ON r.id = b.room_id
      WHERE res.pg_id = ? AND res.status IN ('active', 'notice_given')
      ORDER BY r.floor, r.room_number, b.bed_label
    `).bind(month, pgId).all();
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (!msg.includes('no such column') && !msg.includes('has no column')) throw e;
    // custom_advance migration not applied to this DB yet -- fall back to the
    // pre-migration query so the page still works (advance falls back to the
    // room default, same as before that migration existed).
    queryResult = await env.DB.prepare(`
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
  }
  const { results } = queryResult;

  const today = new Date().toISOString().slice(0, 10);

  // Batched: one query for every row's payment history, instead of one
  // query PER row (was an O(N) sequential round-trip pattern -- with the
  // exceptions batching already fixed, this per-row loop was the last
  // remaining N+1 on this screen).
  const ledgerIds = results.map(r => r.id).filter(Boolean);
  let paymentsByLedgerId = new Map();
  if (ledgerIds.length > 0) {
    const placeholders = ledgerIds.map(() => '?').join(',');
    const { results: allPayments } = await env.DB.prepare(`
      SELECT id, rent_ledger_id, amount, payment_mode, payment_type, payment_date, reference_note, collected_by
      FROM payments
      WHERE rent_ledger_id IN (${placeholders}) AND status IN ('posted', 'migrated')
      ORDER BY payment_date ASC, created_at ASC
    `).bind(...ledgerIds).all();
    for (const p of allPayments) {
      if (!paymentsByLedgerId.has(p.rent_ledger_id)) paymentsByLedgerId.set(p.rent_ledger_id, []);
      paymentsByLedgerId.get(p.rent_ledger_id).push(p);
    }
  }

  const enriched = [];
  for (const row of results) {
    // Compute real status (overdue if past 5th and not fully paid). Residents
    // with no ledger row yet (future joiners, no rent due this month) get
    // status 'not_due' so the UI can show them separately, not as "pending".
    // deriveRentStatus is the single shared implementation of this -- the
    // same one residents.js uses -- so the two screens can't disagree.
    const status = row.id ? deriveRentStatus(row, today) : 'not_due';
    const payments = row.id ? (paymentsByLedgerId.get(row.id) || []) : [];
    // custom_advance overrides the room's default advance_deposit for this
    // one bed, same as custom_rent already does for rent.
    const effectiveAdvance = row.custom_advance != null ? row.custom_advance : row.advance_deposit;
    const advance = deriveAdvanceState(effectiveAdvance, row.advance_paid);

    enriched.push({ ...row, status, payments, advance });
  }

  // One batched pass for the whole PG (2 queries total) instead of per
  // resident -- see functions/_ledger.js for why that mattered.
  const advanceStateByResident = new Map(enriched.map(r => [r.resident_id, r.advance]));
  const exceptionsByResident = await detectExceptionsForPg(env, pgId, advanceStateByResident);
  for (const row of enriched) {
    row.exceptions = exceptionsByResident.get(row.resident_id) || [];
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
    advance_total_expected: enriched.reduce((s, r) => s + (r.advance.expected || 0), 0),
    advance_total_paid: enriched.reduce((s, r) => s + (r.advance_paid || 0), 0),
  };

  // Every resident with at least one exception, flattened for the
  // Rent page's Exceptions section -- computed once here (detectResidentExceptions
  // in functions/_ledger.js) so Residents/Reports can reuse the exact same list
  // instead of re-deriving their own notion of "needs attention".
  const exceptions = enriched
    .filter(r => r.exceptions.length > 0)
    .map(r => ({ resident_id: r.resident_id, resident_name: r.resident_name, floor: r.floor, room_number: r.room_number, bed_label: r.bed_label, items: r.exceptions }));

  return jsonResponse({ summary, rows: enriched, exceptions });
}
