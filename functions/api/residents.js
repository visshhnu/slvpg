// functions/api/residents.js
import { requireAuth, jsonResponse, unauthorized, resolvePgId } from '../_auth.js';

export async function onRequestGet({ request, env }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const pgId = resolvePgId(session, url);
  if (!pgId) return jsonResponse({ error: 'pg_id is required' }, 400);

  const status = url.searchParams.get('status');

  let query = `
    SELECT
      res.*,
      b.bed_label, r.floor, r.room_number, r.monthly_rent, r.sharing_type
    FROM residents res
    LEFT JOIN beds b ON b.id = res.bed_id
    LEFT JOIN rooms r ON r.id = b.room_id
    WHERE res.pg_id = ?
  `;
  const binds = [pgId];
  if (status) {
    query += ' AND res.status = ?';
    binds.push(status);
  }
  query += ' ORDER BY res.status, r.floor, r.room_number';

  const { results } = await env.DB.prepare(query).bind(...binds).all();
  return jsonResponse(results);
}

export async function onRequestPost({ request, env }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const pgId = resolvePgId(session, url);
  if (!pgId) return jsonResponse({ error: 'pg_id is required' }, 400);

  const body = await request.json();
  const {
    name, photo_url, phone, alt_phone, aadhaar_number, aadhaar_photo_url,
    pan_number, pan_photo_url, id_proof_type, id_proof_number, id_proof_photo_url,
    occupation, company_or_college, emergency_contact_name, emergency_contact_phone,
    bed_id, join_date, advance_paid, agreement_signed, police_verification_status, notes
  } = body;

  if (!name || !phone || !bed_id || !join_date) {
    return jsonResponse({ error: 'Name, phone, bed and join date are required' }, 400);
  }

  // Make sure the bed belongs to this PG and is actually free
  const bed = await env.DB.prepare(`
    SELECT b.id, r.pg_id FROM beds b JOIN rooms r ON r.id = b.room_id WHERE b.id = ?
  `).bind(bed_id).first();
  if (!bed || bed.pg_id !== pgId) {
    return jsonResponse({ error: 'That bed does not belong to this PG' }, 400);
  }
  const occupied = await env.DB.prepare(
    `SELECT id FROM residents WHERE bed_id = ? AND status != 'vacated'`
  ).bind(bed_id).first();
  if (occupied) {
    return jsonResponse({ error: 'That bed is already occupied' }, 409);
  }

  let result;
  try {
    // Full insert including photo columns added in migration 0004
    result = await env.DB.prepare(`
      INSERT INTO residents (
        pg_id, name, photo_url, phone, alt_phone, aadhaar_number, aadhaar_photo_url,
        pan_number, pan_photo_url, id_proof_type, id_proof_number, id_proof_photo_url,
        occupation, company_or_college, emergency_contact_name, emergency_contact_phone,
        bed_id, join_date, advance_paid, agreement_signed, police_verification_status, status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `).bind(
      pgId, name, photo_url || null, phone, alt_phone || null,
      aadhaar_number || null, aadhaar_photo_url || null,
      pan_number || null, pan_photo_url || null,
      id_proof_type || null, id_proof_number || null, id_proof_photo_url || null,
      occupation || null, company_or_college || null,
      emergency_contact_name || null, emergency_contact_phone || null,
      bed_id, join_date, advance_paid || 0,
      agreement_signed ? 1 : 0, police_verification_status || 'pending', notes || null
    ).run();
  } catch (e) {
    // Fallback: migration 0004 not yet applied — insert without photo columns
    if (String(e).includes('no such column') || String(e).includes('table residents has no column')) {
      result = await env.DB.prepare(`
        INSERT INTO residents (
          pg_id, name, photo_url, phone, alt_phone, aadhaar_number,
          id_proof_type, id_proof_number,
          occupation, company_or_college, emergency_contact_name, emergency_contact_phone,
          bed_id, join_date, advance_paid, agreement_signed, police_verification_status, status, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
      `).bind(
        pgId, name, photo_url || null, phone, alt_phone || null,
        aadhaar_number || null,
        id_proof_type || null, id_proof_number || null,
        occupation || null, company_or_college || null,
        emergency_contact_name || null, emergency_contact_phone || null,
        bed_id, join_date, advance_paid || 0,
        agreement_signed ? 1 : 0, police_verification_status || 'pending', notes || null
      ).run();
    } else {
      throw e;
    }
  }

  return jsonResponse({ success: true, id: result.meta.last_row_id });
}
