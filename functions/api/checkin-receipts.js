// functions/api/checkin-receipts.js
import { requireAuth, jsonResponse, unauthorized, resolvePgId } from '../_auth.js';

// The house rules + liability terms shown on every check-in receipt.
// Based on the PG's actual house rules (rent due by the 5th, no smoking/alcohol,
// no outsiders, cleanliness, payment only via management, etc.) plus a liability
// clause for property damage/wastage -- exactly what was asked for.
const STANDARD_TERMS = `HOUSE RULES & TERMS OF STAY

1. Rent is due by the 5th of every month. Late payment will be fined as per management's current policy.
2. Vacating residents must inform management at least one month (30 days) in advance. The advance deposit will not be refunded if this notice period is not honoured.
3. Strictly no smoking and no alcohol on the premises.
4. Gutka chewing, tobacco spitting, and spitting inside the premises are strictly prohibited. If found, cleaning charges will be collected from the resident. Premises are under CCTV surveillance.
5. No outsiders are allowed inside resident rooms. Violation may result in the resident being asked to vacate immediately.
6. Residents must keep their room and all common areas clean and well-maintained.
7. Rent and advance payments must be made only through the official management contact. Payments made to any other person are not the management's responsibility.
8. All residents must cooperate with house rules to maintain a peaceful living environment for everyone.
9. LIABILITY FOR DAMAGE & WASTAGE: The resident is liable to pay for any damage caused to PG property (furniture, fittings, electronics, fixtures, or any other asset) beyond normal wear and tear, and for any wastage of utilities (water, electricity) caused by negligence. Charges for such damage or wastage will be deducted from the refundable deposit, or billed separately if they exceed it.
10. Management's decision is final in all operational matters.

By accepting this receipt, the resident acknowledges having read and agreed to the above terms.`;

async function generateReceiptNumber(env, pgId) {
  const year = new Date().getFullYear();
  const count = await env.DB.prepare(
    `SELECT COUNT(*) as c FROM checkin_receipts WHERE pg_id = ? AND receipt_number LIKE ?`
  ).bind(pgId, `%-${year}-%`).first();
  const seq = String(count.c + 1).padStart(4, '0');
  const pg = await env.DB.prepare('SELECT name FROM pgs WHERE id = ?').bind(pgId).first();
  const prefix = (pg?.name || 'PG').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 6);
  return `${prefix}-${year}-${seq}`;
}

export async function onRequestGet({ request, env }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const pgId = resolvePgId(session, url);
  if (!pgId) return jsonResponse({ error: 'pg_id is required' }, 400);

  const residentId = url.searchParams.get('resident_id');
  let query = 'SELECT * FROM checkin_receipts WHERE pg_id = ?';
  const binds = [pgId];
  if (residentId) {
    query += ' AND resident_id = ?';
    binds.push(residentId);
  }
  query += ' ORDER BY created_at DESC';

  const { results } = await env.DB.prepare(query).bind(...binds).all();
  return jsonResponse(results);
}

export async function onRequestPost({ request, env }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const pgId = resolvePgId(session, url);
  if (!pgId) return jsonResponse({ error: 'pg_id is required' }, 400);

  const { resident_id } = await request.json();
  if (!resident_id) return jsonResponse({ error: 'resident_id is required' }, 400);

  const resident = await env.DB.prepare(`
    SELECT res.*, b.bed_label, r.id as room_id, r.floor, r.room_number, r.sharing_type,
           r.monthly_rent, r.advance_deposit, r.refundable_amount
    FROM residents res
    LEFT JOIN beds b ON b.id = res.bed_id
    LEFT JOIN rooms r ON r.id = b.room_id
    WHERE res.id = ? AND res.pg_id = ?
  `).bind(resident_id, pgId).first();

  if (!resident) return jsonResponse({ error: 'Resident not found in this PG' }, 404);
  if (!resident.room_id) return jsonResponse({ error: 'Resident is not currently assigned to a bed' }, 400);

  const { results: facilities } = await env.DB.prepare(
    'SELECT item_name, quantity, condition, notes FROM room_facilities WHERE room_id = ?'
  ).bind(resident.room_id).all();

  const receiptNumber = await generateReceiptNumber(env, pgId);

  const result = await env.DB.prepare(`
    INSERT INTO checkin_receipts (
      pg_id, resident_id, receipt_number, room_floor, room_number, bed_label, sharing_type,
      join_date, monthly_rent, advance_deposit, refundable_amount, advance_paid_now,
      room_condition_snapshot, terms_snapshot, generated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    pgId, resident_id, receiptNumber, resident.floor, resident.room_number, resident.bed_label,
    resident.sharing_type, resident.join_date, resident.monthly_rent, resident.advance_deposit,
    resident.refundable_amount, resident.advance_paid,
    JSON.stringify(facilities), STANDARD_TERMS, session.name
  ).run();

  return jsonResponse({ success: true, id: result.meta.last_row_id, receipt_number: receiptNumber });
}
