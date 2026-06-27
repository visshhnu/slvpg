// functions/api/residents/[id].js
import { requireAuth, jsonResponse, unauthorized } from '../../_auth.js';

export async function onRequestGet({ request, env, params }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const resident = await env.DB.prepare(`
    SELECT res.*, b.bed_label, r.floor, r.room_number, r.monthly_rent, r.sharing_type
    FROM residents res
    LEFT JOIN beds b ON b.id = res.bed_id
    LEFT JOIN rooms r ON r.id = b.room_id
    WHERE res.id = ?
  `).bind(params.id).first();

  if (!resident) return jsonResponse({ error: 'Not found' }, 404);

  const { results: payments } = await env.DB.prepare(
    'SELECT * FROM payments WHERE resident_id = ? ORDER BY payment_date DESC'
  ).bind(params.id).all();

  const { results: ledger } = await env.DB.prepare(
    'SELECT * FROM rent_ledger WHERE resident_id = ? ORDER BY month DESC'
  ).bind(params.id).all();

  return jsonResponse({ ...resident, payments, ledger });
}

export async function onRequestPatch({ request, env, params }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const body = await request.json();
  const allowedFields = [
    'name', 'phone', 'alt_phone', 'id_proof_type', 'id_proof_number',
    'occupation', 'company_or_college', 'emergency_contact_name', 'emergency_contact_phone',
    'status', 'notice_date', 'planned_vacate_date', 'actual_vacate_date',
    'refund_paid', 'refund_paid_date', 'notes', 'advance_paid', 'bed_id'
  ];

  const updates = [];
  const binds = [];
  for (const field of allowedFields) {
    if (field in body) {
      updates.push(`${field} = ?`);
      binds.push(body[field]);
    }
  }
  if (updates.length === 0) {
    return jsonResponse({ error: 'No valid fields to update' }, 400);
  }

  // If marking as vacated, free up the bed
  if (body.status === 'vacated') {
    const resident = await env.DB.prepare('SELECT bed_id FROM residents WHERE id = ?').bind(params.id).first();
    if (resident && resident.bed_id) {
      updates.push('bed_id = ?');
      binds.push(null);
    }
    if (!body.actual_vacate_date) {
      updates.push('actual_vacate_date = ?');
      binds.push(new Date().toISOString().slice(0, 10));
    }
  }

  binds.push(params.id);
  await env.DB.prepare(
    `UPDATE residents SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...binds).run();

  return jsonResponse({ success: true });
}

export async function onRequestDelete({ request, env, params }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  await env.DB.prepare('DELETE FROM residents WHERE id = ?').bind(params.id).run();
  return jsonResponse({ success: true });
}
