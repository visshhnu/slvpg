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

  // Record the payment transaction (status defaults to 'posted' -- only
  // posted payments ever count toward a balance, see functions/_ledger.js)
  await env.DB.prepare(`
    INSERT INTO payments (pg_id, rent_ledger_id, resident_id, amount, payment_mode, payment_type, collected_by, reference_note, payment_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    pgId, rent_ledger_id || null, resident_id, amount,
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
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);

  let query = `
    SELECT p.*, res.name as resident_name, r.floor, r.room_number
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

  query += ' ORDER BY p.created_at DESC LIMIT ?';
  binds.push(limit);

  const { results } = await env.DB.prepare(query).bind(...binds).all();
  return jsonResponse(results);
}
