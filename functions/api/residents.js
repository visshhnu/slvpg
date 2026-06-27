// functions/api/residents.js
import { requireAuth, jsonResponse, unauthorized } from '../_auth.js';

export async function onRequestGet({ request, env }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const status = url.searchParams.get('status'); // optional filter

  let query = `
    SELECT
      res.*,
      b.bed_label, r.floor, r.room_number, r.monthly_rent, r.sharing_type
    FROM residents res
    LEFT JOIN beds b ON b.id = res.bed_id
    LEFT JOIN rooms r ON r.id = b.room_id
  `;
  const binds = [];
  if (status) {
    query += ' WHERE res.status = ?';
    binds.push(status);
  }
  query += ' ORDER BY res.status, r.floor, r.room_number';

  const stmt = binds.length
    ? env.DB.prepare(query).bind(...binds)
    : env.DB.prepare(query);

  const { results } = await stmt.all();
  return jsonResponse(results);
}

export async function onRequestPost({ request, env }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const body = await request.json();
  const {
    name, phone, alt_phone, id_proof_type, id_proof_number,
    occupation, company_or_college, emergency_contact_name, emergency_contact_phone,
    bed_id, join_date, advance_paid, notes
  } = body;

  if (!name || !phone || !bed_id || !join_date) {
    return jsonResponse({ error: 'Name, phone, bed and join date are required' }, 400);
  }

  // Make sure the bed is actually free
  const occupied = await env.DB.prepare(
    `SELECT id FROM residents WHERE bed_id = ? AND status != 'vacated'`
  ).bind(bed_id).first();
  if (occupied) {
    return jsonResponse({ error: 'That bed is already occupied' }, 409);
  }

  const result = await env.DB.prepare(`
    INSERT INTO residents (
      name, phone, alt_phone, id_proof_type, id_proof_number,
      occupation, company_or_college, emergency_contact_name, emergency_contact_phone,
      bed_id, join_date, advance_paid, status, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
  `).bind(
    name, phone, alt_phone || null, id_proof_type || null, id_proof_number || null,
    occupation || null, company_or_college || null,
    emergency_contact_name || null, emergency_contact_phone || null,
    bed_id, join_date, advance_paid || 0, notes || null
  ).run();

  return jsonResponse({ success: true, id: result.meta.last_row_id });
}
