// functions/api/residents/[id].js
import { requireAuth, jsonResponse, unauthorized, isPgAllowed } from '../../_auth.js';
import { deriveRentStatus, deriveAdvanceState, syncCurrentMonthRent } from '../../_ledger.js';

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
    SELECT res.*, b.bed_label, r.floor, r.room_number, r.monthly_rent, r.sharing_type, r.pg_id,
      r.advance_deposit, r.refundable_amount
    FROM residents res
    LEFT JOIN beds b ON b.id = res.bed_id
    LEFT JOIN rooms r ON r.id = b.room_id
    WHERE res.id = ?
  `).bind(params.id).first();

  if (!resident) return jsonResponse({ error: 'Not found' }, 404);
  if (!isPgAllowed(session, resident.pg_id)) return unauthorized();

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
  // custom_advance overrides the room's default advance_deposit for this bed,
  // same as custom_rent already does for rent. resident.advance_deposit was
  // previously never selected above at all -- this card's advance figures
  // were showing $0 target regardless of the room's real deposit.
  const effectiveAdvance = resident.custom_advance != null ? resident.custom_advance : resident.advance_deposit;
  const advance = deriveAdvanceState(effectiveAdvance, resident.advance_paid);

  return jsonResponse({ ...resident, payments, ledger, refund_eligibility: refundEligibility, rent_this_month, advance });
}

export async function onRequestPatch({ request, env, params }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  try {
    // res.pg_id (from res.*) is this resident's own PG, set once at creation
    // and never dependent on their current bed -- room_pg_id is aliased
    // separately so it can't silently overwrite res.pg_id in the result
    // object (same column name from both tables = last one wins in a plain
    // SELECT res.*, r.pg_id). That collision used to make existing.pg_id
    // resolve to NULL for any vacated resident (no bed_id -> LEFT JOIN
    // through beds/rooms produces nothing), which would have made both the
    // ownership check below AND the advance-payment insert further down
    // silently use/write a NULL pg_id for anyone vacated.
    const existing = await env.DB.prepare(`
      SELECT res.*, r.pg_id as room_pg_id FROM residents res
      LEFT JOIN beds b ON b.id = res.bed_id LEFT JOIN rooms r ON r.id = b.room_id
      WHERE res.id = ?
    `).bind(params.id).first();
    if (!existing) return jsonResponse({ error: 'Not found' }, 404);
    if (!isPgAllowed(session, existing.pg_id)) return unauthorized();

    const body = await request.json();
    // advance_paid is deliberately NOT in this list. It must only ever
    // change via a real payment through POST /payments
    // (recomputeResidentLedger) -- a direct edit here used to let someone
    // "fix" it by typing a smaller number, which silently reverted itself
    // the next time anything else touched that resident's payments (the
    // underlying duplicate/incorrect payment row was never actually voided
    // or deleted, so recompute would just put the wrong number back).
    const allowedFields = [
      'name', 'photo_url', 'phone', 'alt_phone', 'aadhaar_number', 'aadhaar_photo_url', 'aadhaar_back_photo_url',
      'pan_number', 'pan_photo_url', 'id_proof_type', 'id_proof_number', 'id_proof_photo_url', 'passport_photo_url',
      'occupation', 'company_or_college', 'emergency_contact_name', 'emergency_contact_phone',
      'status', 'notice_date', 'planned_vacate_date', 'actual_vacate_date',
      'room_inspection_done', 'room_inspection_notes', 'deductions', 'deduction_reason',
      'refund_paid', 'refund_paid_date', 'notes', 'bed_id', 'join_date',
      'agreement_signed', 'agreement_url', 'police_verification_status', 'custom_rent', 'custom_advance',
      'first_month_due_option'
    ];
    // Columns from migrations that may not have been applied to this DB yet
    // -- if the UPDATE fails on one of these specifically, it gets dropped
    // and the update retried rather than failing the whole edit (name/phone/
    // etc. should still save even if an override field can't).
    const RETRYABLE_IF_MISSING = new Set(['custom_advance', 'first_month_due_option']);

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

    // Moving a resident to a different bed (from Edit Resident) needs the
    // same guard the Add Resident flow already has -- otherwise two active
    // residents could end up pointing at the same bed_id. residents.js's
    // POST checks this for a brand-new resident; nothing checked it for an
    // existing one being moved, since bed_id was never editable here before.
    if ('bed_id' in body && body.bed_id !== existing.bed_id) {
      const bed = await env.DB.prepare(
        `SELECT b.id, r.pg_id FROM beds b JOIN rooms r ON r.id = b.room_id WHERE b.id = ?`
      ).bind(body.bed_id).first();
      if (!bed || bed.pg_id !== existing.pg_id) {
        return jsonResponse({ error: 'That bed does not belong to this PG' }, 400);
      }
      const occupied = await env.DB.prepare(
        `SELECT id FROM residents WHERE bed_id = ? AND status != 'vacated' AND id != ?`
      ).bind(body.bed_id, params.id).first();
      if (occupied) {
        return jsonResponse({ error: 'That bed is already occupied' }, 409);
      }
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
    let droppedFields = [];
    for (let attempt = 0; ; attempt++) {
      try {
        await env.DB.prepare(
          `UPDATE residents SET ${updates.join(', ')} WHERE id = ?`
        ).bind(...binds).run();
        break;
      } catch (e) {
        const msg = String((e && e.message) || e);
        const match = msg.match(/no such column:\s*(\w+)/i) || msg.match(/has no column named[: ]?(\w+)/i);
        const missingCol = match && match[1];
        if (!missingCol || !RETRYABLE_IF_MISSING.has(missingCol)) {
          return jsonResponse({
            error: missingCol
              ? 'This update includes a field your database doesn\'t have yet. Ask an admin to run the latest migrations (wrangler d1 migrations apply), then try again. (' + msg + ')'
              : 'Could not save changes: ' + msg
          }, 500);
        }
        const updateIdx = updates.findIndex(u => u.startsWith(missingCol + ' '));
        if (updateIdx === -1) {
          // Already dropped, or not something we can retry without -- bail.
          return jsonResponse({ error: 'Could not save changes: ' + msg }, 500);
        }
        updates.splice(updateIdx, 1);
        binds.splice(updateIdx, 1);
        droppedFields.push(missingCol);
        if (updates.length === 0) {
          return jsonResponse({
            error: `The following couldn't be saved until an admin runs the latest migrations (wrangler d1 migrations apply): ${droppedFields.join(', ')}. No changes were saved.`
          }, 500);
        }
      }
    }

    // If custom_rent changed, OR the resident was moved to a different bed
    // (a different room can mean a different monthly_rent), the current
    // month's rent_ledger row was a snapshot taken before this edit --
    // self-heal it right now instead of leaving it stale until the next
    // unrelated page load happens to trigger ensureLedgerRows. This is
    // exactly the "I corrected the rent/room but it still shows the old
    // due/overpaid figures" gap.
    if ('custom_rent' in body || 'bed_id' in body || 'first_month_due_option' in body) {
      await syncCurrentMonthRent(env, params.id);
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
