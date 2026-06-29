// functions/api/rent.js
import { requireAuth, jsonResponse, unauthorized, resolvePgId } from '../_auth.js';
import { ensureLedgerRows } from '../_rent.js';

export async function onRequestGet({ request, env }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const pgId = resolvePgId(session, url);
  if (!pgId) return jsonResponse({ error: 'pg_id is required' }, 400);

  const month = url.searchParams.get('month') || new Date().toISOString().slice(0, 7);

  // Auto-create ledger rows for all active residents who don't have one yet
  await ensureLedgerRows(env, pgId, month);

  // Fetch ledger rows with resident + room info AND advance info from the room
  const { results } = await env.DB.prepare(`
    SELECT
      rl.*,
      res.name as resident_name, res.phone as resident_phone,
      res.status as resident_status, res.advance_paid,
      r.floor, r.room_number, r.advance_deposit, r.refundable_amount,
      b.bed_label
    FROM rent_ledger rl
    JOIN residents res ON res.id = rl.resident_id
    LEFT JOIN beds b ON b.id = res.bed_id
    LEFT JOIN rooms r ON r.id = b.room_id
    WHERE rl.pg_id = ? AND rl.month = ?
    ORDER BY r.floor, r.room_number, b.bed_label
  `).bind(pgId, month).all();

  const today = new Date().toISOString().slice(0, 10);

  // For each ledger row, also fetch the individual payment transactions for this month
  const enriched = [];
  for (const row of results) {
    // Compute real status (overdue if past 5th and not fully paid)
    let status = row.status;
    if ((status === 'pending' || status === 'partial') && today > row.due_date) {
      status = 'overdue';
    }

    // Fetch payment history for this ledger row
    const { results: payments } = await env.DB.prepare(`
      SELECT id, amount, payment_mode, payment_type, payment_date, reference_note, collected_by
      FROM payments
      WHERE rent_ledger_id = ?
      ORDER BY payment_date ASC, created_at ASC
    `).bind(row.id).all();

    enriched.push({ ...row, status, payments });
  }

  // Sort: overdue first, then partial, then pending, then paid
  const order = { overdue: 0, partial: 1, pending: 2, paid: 3 };
  enriched.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));

  const summary = {
    month,
    total_due: enriched.reduce((s, r) => s + r.amount_due, 0),
    total_paid: enriched.reduce((s, r) => s + r.amount_paid, 0),
    total_pending: enriched.reduce((s, r) => s + (r.amount_due - r.amount_paid), 0),
    overdue_count: enriched.filter(r => r.status === 'overdue').length,
    partial_count: enriched.filter(r => r.status === 'partial').length,
  };

  return jsonResponse({ summary, rows: enriched });
}
