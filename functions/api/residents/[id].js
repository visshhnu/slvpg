// functions/api/residents/[id].js
import { requireAuth, jsonResponse, unauthorized } from '../../_auth.js';
import { deriveRentStatus, deriveAdvanceState } from '../../_ledger.js';

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

  // ledger_month lets the payment-history UI label a rent payment "for July
  // 2026" etc. -- without it, two real payments for two different months
  // (e.g. this month's rent collected a day early, alongside last month's)
  // are indistinguishable from an accidental duplicate entry at a glance.
  const { results: payments } = await env.DB.prepare(`
    SELECT p.*, rl.month as ledger_month
    FROM payments p
    LEFT JOIN rent_ledger rl ON rl.id = p.rent_ledger_id
    WHERE p.resident_id = ? AND p.status IN ('posted', 'migrated')
    ORDER BY p.payment_date DESC
  `).bind(params.id).all();

  const { results: ledger } = await env.DB.prepare(
    'SELECT * FROM rent_ledger WHERE resident_id = ? ORDER BY month DESC'
  ).bind(params.id).all();

  const refundEligibility = computeRefundEligibility(resident.notice_date, resident.planned_vacate_date);

  // Current-month ledger summary + advance summary, using the same shared
  // derivation as Rent tab and Residents tab, so this detail view can't show
  // a different truth than either of those screens.
  const today = new Date().toISOString().slice(0, 10);
  const currentMonth = today.slice(0, 7);
  const currentLedgerRow = ledger.find(l => l.month === currentMonth) || null;
  const rent_this_month = {
    expected: currentLedgerRow ? currentLedgerRow.amount_due : null,
    paid: currentLedgerRow ? currentLedgerRow.amount_paid : 0,
    due: currentLedgerRow ? currentLedgerRow.amount_due - currentLedgerRow.amount_paid : 0,
    status: deriveRentStatus(currentLedgerRow, today),
  };
  const advance = deriveAdvanceState(resident.advance_deposit, resident.advance_paid);

  return jsonResponse({ ...resident, payments, ledger, refund_eligibility: refundEligibility, rent_this_month, advance });
}

export async function onRequestPatch({ request, env, params }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  try {
    const existing = await env.DB.prepare(`
      SELECT res.*, r.pg_id FROM residents res
      LEFT JOIN beds b ON b.id = res.bed_id LEFT JOIN rooms r ON r.id = b.room_id
      WHERE res.id = ?
    `).bind(params.id).first();
    if (!existing) return jsonResponse({ error: 'Not found' }, 404);

    const body = await request.json();
    const allowedFields = [
      'name', 'photo_url', 'phone', 'alt_phone', 'aadhaar_number', 'aadhaar_photo_url', 'aadhaar_back_photo_url',
      'pan_number', 'pan_photo_url', 'id_proof_type', 'id_proof_number', 'id_proof_photo_url', 'passport_photo_url',
      'occupation', 'company_or_college', 'emergency_contact_name', 'emergency_contact_phone',
      'status', 'notice_date', 'planned_vacate_date', 'actual_vacate_date',
      'room_inspection_done', 'room_inspection_notes', 'deductions', 'deduction_reason',
      'refund_paid', 'refund_paid_date', 'notes', 'advance_paid', 'bed_id', 'join_date',
      'agreement_signed', 'agreement_url', 'police_verification_status', 'custom_rent'
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
    try {
      await env.DB.prepare(
        `UPDATE residents SET ${updates.join(', ')} WHERE id = ?`
      ).bind(...binds).run();
    } catch (e) {
      const msg = String((e && e.message) || e);
      if (msg.includes('no such column') || msg.includes('has no column')) {
        return jsonResponse({
          error: 'This update includes a field your database doesn\'t have yet. Ask an admin to run the latest migrations (wrangler d1 migrations apply), then try again. (' + msg + ')'
        }, 500);
      }
      return jsonResponse({ error: 'Could not save changes: ' + msg }, 500);
    }

    // Same fix as resident creation: if advance_paid was increased directly
    // from this edit form (rather than through the Rent tab's "+ Add
    // instalment" flow), log the difference as a real payments row too, dated
    // today, so it isn't invisible money in the dashboard's period totals.
    if ('advance_paid' in body) {
      const newAdvance = Number(body.advance_paid) || 0;
      const oldAdvance = Number(existing.advance_paid) || 0;
      const delta = newAdvance - oldAdvance;
      if (delta > 0) {
        await env.DB.prepare(`
          INSERT INTO payments (pg_id, resident_id, amount, payment_date, payment_mode, payment_type, collected_by, reference_note)
          VALUES (?, ?, ?, ?, 'cash', 'advance', ?, 'Advance updated via edit')
        `).bind(existing.pg_id, params.id, delta, new Date().toISOString().slice(0, 10), session.name).run();
      }
    }

    return jsonResponse({ success: true });
  } catch (e) {
    return jsonResponse({ error: 'Unexpected error updating resident: ' + String((e && e.message) || e) }, 500);
  }
}

export async function onRequestDelete({ request, env, params }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();
  if (session.role !== 'admin') {
    return jsonResponse({ error: 'Only an admin can permanently delete a resident record' }, 403);
  }

  await env.DB.prepare('DELETE FROM residents WHERE id = ?').bind(params.id).run();
  return jsonResponse({ success: true });
}
