// functions/api/residents.js
import { requireAuth, jsonResponse, unauthorized, resolvePgId } from '../_auth.js';
import { ensureLedgerRows } from '../_rent.js';

export async function onRequestGet({ request, env }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const pgId = resolvePgId(session, url);
  if (!pgId) return jsonResponse({ error: 'pg_id is required' }, 400);

  const status = url.searchParams.get('status');
  const currentMonth = new Date().toISOString().slice(0, 7);

  // Same fix as dashboard.js: create this month's ledger rows before reading
  // them, so "No rent entry yet" doesn't show just because no one opened Rent tab.
  await ensureLedgerRows(env, pgId, currentMonth);

  let query = `
    SELECT
      res.*,
      b.bed_label, r.floor, r.room_number, r.monthly_rent, r.sharing_type,
      r.advance_deposit, r.refundable_amount
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

  // Enrich each resident with current month rent status + check-in receipt flag
  const enriched = [];
  for (const res of results) {
    // Current month rent ledger row
    const rentRow = await env.DB.prepare(
      `SELECT amount_due, amount_paid, status, due_date
       FROM rent_ledger WHERE resident_id = ? AND month = ?`
    ).bind(res.id, currentMonth).first();

    // Check if a check-in receipt exists
    const receipt = await env.DB.prepare(
      `SELECT id FROM checkin_receipts WHERE resident_id = ? LIMIT 1`
    ).bind(res.id).first();

    // Compute overdue flag
    let rentStatus = rentRow ? rentRow.status : null;
    const today = new Date().toISOString().slice(0, 10);
    if (rentStatus && rentStatus !== 'paid' && rentRow.due_date && today > rentRow.due_date) {
      rentStatus = 'overdue';
    }

    enriched.push({
      ...res,
      rent_this_month: rentRow ? {
        amount_due: rentRow.amount_due,
        amount_paid: rentRow.amount_paid,
        status: rentStatus,
      } : null,
      has_checkin_receipt: !!receipt,
    });
  }

  return jsonResponse(enriched);
}

export async function onRequestPost({ request, env }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const pgId = resolvePgId(session, url);
  if (!pgId) return jsonResponse({ error: 'pg_id is required' }, 400);

  const body = await request.json();
  const {
    name, photo_url, phone, alt_phone, aadhaar_number, aadhaar_photo_url, aadhaar_back_photo_url,
    pan_number, pan_photo_url, id_proof_type, id_proof_number, id_proof_photo_url, passport_photo_url,
    occupation, company_or_college, emergency_contact_name, emergency_contact_phone,
    bed_id, join_date, advance_paid, agreement_signed, police_verification_status, notes, custom_rent
  } = body;

  if (!name || !phone || !bed_id || !join_date) {
    return jsonResponse({ error: 'Name, phone, bed and join date are required' }, 400);
  }

  const bed = await env.DB.prepare(
    `SELECT b.id, r.pg_id FROM beds b JOIN rooms r ON r.id = b.room_id WHERE b.id = ?`
  ).bind(bed_id).first();
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
    result = await env.DB.prepare(`
      INSERT INTO residents (
        pg_id, name, photo_url, phone, alt_phone, aadhaar_number, aadhaar_photo_url, aadhaar_back_photo_url,
        pan_number, pan_photo_url, id_proof_type, id_proof_number, id_proof_photo_url, passport_photo_url,
        occupation, company_or_college, emergency_contact_name, emergency_contact_phone,
        bed_id, join_date, advance_paid, agreement_signed, police_verification_status, status, notes, custom_rent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).bind(
      pgId, name, photo_url || null, phone, alt_phone || null,
      aadhaar_number || null, aadhaar_photo_url || null, aadhaar_back_photo_url || null,
      pan_number || null, pan_photo_url || null,
      id_proof_type || null, id_proof_number || null, id_proof_photo_url || null, passport_photo_url || null,
      occupation || null, company_or_college || null,
      emergency_contact_name || null, emergency_contact_phone || null,
      bed_id, join_date, advance_paid || 0,
      agreement_signed ? 1 : 0, police_verification_status || 'pending', notes || null,
      custom_rent || null
    ).run();
  } catch (e) {
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
