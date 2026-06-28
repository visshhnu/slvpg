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

  // Record the payment transaction
  await env.DB.prepare(`
    INSERT INTO payments (pg_id, rent_ledger_id, resident_id, amount, payment_mode, payment_type, collected_by, reference_note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    pgId, rent_ledger_id || null, resident_id, amount,
    payment_mode || 'cash', payment_type || 'rent',
    session.name, reference_note || null
  ).run();

  if (payment_type === 'advance') {
    // Advance payment: accumulate into residents.advance_paid
    const resident = await env.DB.prepare('SELECT advance_paid FROM residents WHERE id = ?').bind(resident_id).first();
    if (resident) {
      await env.DB.prepare(
        'UPDATE residents SET advance_paid = ? WHERE id = ?'
      ).bind((resident.advance_paid || 0) + amount, resident_id).run();
    }
  } else if (rent_ledger_id) {
    // Rent payment: update the ledger row's amount_paid and status
    const ledgerRow = await env.DB.prepare('SELECT * FROM rent_ledger WHERE id = ?').bind(rent_ledger_id).first();
    if (ledgerRow) {
      const newPaid = ledgerRow.amount_paid + amount;
      // Cap at amount_due so overpayment doesn't flip to weird status
      const capped = Math.min(newPaid, ledgerRow.amount_due);
      const newStatus = capped >= ledgerRow.amount_due ? 'paid' : 'partial';
      await env.DB.prepare(
        'UPDATE rent_ledger SET amount_paid = ?, status = ? WHERE id = ?'
      ).bind(capped, newStatus, rent_ledger_id).run();
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

  const residentId = url.searchParams.get('resident_id');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);

  let query = `
    SELECT p.*, res.name as resident_name, r.floor, r.room_number
    FROM payments p
    JOIN residents res ON res.id = p.resident_id
    LEFT JOIN beds b ON b.id = res.bed_id
    LEFT JOIN rooms r ON r.id = b.room_id
    WHERE p.pg_id = ?
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
