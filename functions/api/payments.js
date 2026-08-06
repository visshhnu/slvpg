// functions/api/payments.js
import { requireAuth, jsonResponse, unauthorized, resolvePgId } from '../_auth.js';
import { recomputeResidentLedger } from '../_ledger.js';

export async function onRequestPost({ request, env }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const pgId = resolvePgId(session, url);
  if (!pgId) return jsonResponse({ error: 'pg_id is required' }, 400);

  const body = await request.json();
  const { resident_id, rent_ledger_id, amount, payment_mode, payment_type, reference_note, payment_date } = body;

  if (!resident_id || !amount || amount <= 0) {
    return jsonResponse({ error: 'Resident and a positive amount are required' }, 400);
  }

  // Payment date defaults to today if not supplied, but staff can backdate
  // it (e.g. cash collected a few days ago, entered into the app late).
  const today = new Date().toISOString().slice(0, 10);
  const effectiveDate = payment_date && /^\d{4}-\d{2}-\d{2}$/.test(payment_date) ? payment_date : today;

  // A refund is money leaving the PG -- the opposite direction from rent/
  // advance. Stored as a NEGATIVE amount so a plain SUM() anywhere else in
  // the app (Reports' payment totals, etc.) nets it out correctly on its
  // own, without every summing site needing to know about payment_type.
  // The client still sends a plain positive "how much to refund" number.
  const storedAmount = payment_type === 'refund' ? -Math.abs(amount) : amount;

  // Record the payment transaction (status defaults to 'posted' -- only
  // posted payments ever count toward a balance, see functions/_ledger.js)
  await env.DB.prepare(`
    INSERT INTO payments (pg_id, rent_ledger_id, resident_id, amount, payment_mode, payment_type, collected_by, reference_note, payment_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    pgId, rent_ledger_id || null, resident_id, storedAmount,
    payment_mode || 'cash', payment_type || 'rent',
    session.name, reference_note || null, effectiveDate
  ).run();

  // Re-derive rent_ledger + residents.advance_paid from the payments table
  // instead of incrementing a stored counter -- the single shared formula
  // used everywhere (see functions/_ledger.js).
  await recomputeResidentLedger(env, resident_id);

  return jsonResponse({ success: true });
}

export async function onRequestGet({ request, env }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const pgId = resolvePgId(session, url);
  if (!pgId) return jsonResponse({ error: 'pg_id is required' }, 400);

  const residentId = url.searchParams.get('resident_id');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  // Only applied when both a resident filter and a date range are absent --
  // Reports pulls the whole period's transactions via from/to and needs
  // every matching row, not just the most recent 50.
  const limit = Math.min(parseInt(url.searchParams.get('limit') || (from && to ? '1000' : '50'), 10), 1000);

  let query = `
    SELECT p.*, res.name as resident_name, res.phone, r.floor, r.room_number, b.bed_label
    FROM payments p
    JOIN residents res ON res.id = p.resident_id
    LEFT JOIN beds b ON b.id = res.bed_id
    LEFT JOIN rooms r ON r.id = b.room_id
    WHERE p.pg_id = ? AND p.status IN ('posted', 'migrated')
  `;
  const binds = [pgId];

  if (residentId) {
    query += ' AND p.resident_id = ?';
    binds.push(residentId);
  }
  // Date-range filter (used by Reports) -- previously accepted these params
  // and silently ignored them, so a report claiming to cover "3 months"
  // actually never filtered by date at all.
  if (from && to) {
    query += ' AND p.payment_date BETWEEN ? AND ?';
    binds.push(from, to);
  }

  query += ' ORDER BY p.payment_date DESC, p.created_at DESC LIMIT ?';
  binds.push(limit);

  const { results } = await env.DB.prepare(query).bind(...binds).all();
  return jsonResponse(results);
}
