// functions/api/residents/[id].js
import { requireAuth, jsonResponse, unauthorized } from '../../_auth.js';

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / (1000 * 60 * 60 * 24));
}

// Per house rules: advance is refundable only if notice was given at least 30 days
// before the planned vacate date. This mirrors the spec doc's "automatically determine
// whether the resident is eligible for refund based on notice period" requirement.
function computeRefundEligibility(notice_date, planned_vacate_date) {
  if (!notice_date || !planned_vacate_date) return null;
  const noticeDays = daysBetween(notice_date, planned_vacate_date);
  return {
    notice_days_given: noticeDays,
    eligible: noticeDays >= 30,
  };
}

export async function onRequestGet({ request, env, params }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const resident = await env.DB.prepare(`
    SELECT res.*, b.bed_label, r.floor, r.room_number, r.monthly_rent, r.sharing_type, r.pg_id
    FROM residents res
    LEFT JOIN beds b ON b.id = res.bed_id
    LEFT JOIN rooms r ON r.id = b.room_id
    WHERE res.id = ?
  `).bind(params.id).first();

  if (!resident) return jsonResponse({ error: 'Not found' }, 404);
  if (session.role !== 'admin' && resident.pg_id !== session.pgId) return unauthorized();

  const { results: payments } = await env.DB.prepare(
    'SELECT * FROM payments WHERE resident_id = ? ORDER BY payment_date DESC'
  ).bind(params.id).all();

  const { results: ledger } = await env.DB.prepare(
    'SELECT * FROM rent_ledger WHERE resident_id = ? ORDER BY month DESC'
  ).bind(params.id).all();

  const refundEligibility = computeRefundEligibility(resident.notice_date, resident.planned_vacate_date);

  return jsonResponse({ ...resident, payments, ledger, refund_eligibility: refundEligibility });
}

export async function onRequestPatch({ request, env, params }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const existing = await env.DB.prepare(`
    SELECT res.*, r.pg_id FROM residents res
    LEFT JOIN beds b ON b.id = res.bed_id LEFT JOIN rooms r ON r.id = b.room_id
    WHERE res.id = ?
  `).bind(params.id).first();
  if (!existing) return jsonResponse({ error: 'Not found' }, 404);

  const body = await request.json();
  const allowedFields = [
    'name', 'photo_url', 'phone', 'alt_phone', 'aadhaar_number', 'id_proof_type', 'id_proof_number',
    'occupation', 'company_or_college', 'emergency_contact_name', 'emergency_contact_phone',
    'status', 'notice_date', 'planned_vacate_date', 'actual_vacate_date',
    'room_inspection_done', 'room_inspection_notes', 'deductions', 'deduction_reason',
    'refund_paid', 'refund_paid_date', 'notes', 'advance_paid', 'bed_id',
    'agreement_signed', 'agreement_url', 'police_verification_status'
  ];

  const updates = [];
  const binds = [];
  for (const field of allowedFields) {
    if (field in body) {
      updates.push(`${field} = ?`);
      let val = body[field];
      if (field === 'agreement_signed' || field === 'room_inspection_done') val = val ? 1 : 0;
      binds.push(val);
    }
  }
  if (updates.length === 0) {
    return jsonResponse({ error: 'No valid fields to update' }, 400);
  }

  if (body.status === 'vacated') {
    if (existing.bed_id) {
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
