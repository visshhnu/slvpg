// functions/api/payments.js
import { requireAuth, jsonResponse, unauthorized, resolvePgId } from '../_auth.js';

export async function onRequestPost({ request, env }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const pgId = resolvePgId(session, url);
  if (!pgId) return jsonResponse({ error: 'pg_id is required' }, 400);

  const body = await request.json();
  const { resident_id, rent_ledger_id, amount, payment_mode, payment_type, reference_note } = body;

  if (!resident_id || !amount || amount <= 0) {
    return jsonResponse({ error: 'Resident and a positive amount are required' }, 400);
  }

  await env.DB.prepare(`
    INSERT INTO payments (pg_id, rent_ledger_id, resident_id, amount, payment_mode, payment_type, collected_by, reference_note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    pgId, rent_ledger_id || null, resident_id, amount,
    payment_mode || 'cash', payment_type || 'rent',
    session.name, reference_note || null
  ).run();

  if (rent_ledger_id) {
    const ledgerRow = await env.DB.prepare('SELECT * FROM rent_ledger WHERE id = ?').bind(rent_ledger_id).first();
    if (ledgerRow) {
      const newPaid = ledgerRow.amount_paid + amount;
      const newStatus = newPaid >= ledgerRow.amount_due ? 'paid' : 'partial';
      await env.DB.prepare(
        'UPDATE rent_ledger SET amount_paid = ?, status = ? WHERE id = ?'
      ).bind(newPaid, newStatus, rent_ledger_id).run();
    }
  }

  return jsonResponse({ success: true });
}

export async function onRequestGet({ request, env }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const pgId = resolvePgId(session, url);
  if (!pgId) return jsonResponse({ error: 'pg_id is required' }, 400);

  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);

  const { results } = await env.DB.prepare(`
    SELECT p.*, res.name as resident_name, r.floor, r.room_number
    FROM payments p
    JOIN residents res ON res.id = p.resident_id
    LEFT JOIN beds b ON b.id = res.bed_id
    LEFT JOIN rooms r ON r.id = b.room_id
    WHERE p.pg_id = ?
    ORDER BY p.created_at DESC
    LIMIT ?
  `).bind(pgId, limit).all();

  return jsonResponse(results);
}
