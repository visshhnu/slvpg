// functions/api/payments/[id].js
import { requireAuth, jsonResponse, unauthorized } from '../../_auth.js';
import { recomputeResidentLedger } from '../../_ledger.js';

export async function onRequestPatch({ request, env, params }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const payment = await env.DB.prepare('SELECT * FROM payments WHERE id = ?').bind(params.id).first();
  if (!payment) return jsonResponse({ error: 'Not found' }, 404);

  const canEdit = session.role === 'admin'
    || (session.role === 'pg_manager' && session.pgId === payment.pg_id);
  if (!canEdit) {
    return jsonResponse({ error: 'Only an admin or PG manager can edit a payment. Use "Flag a Correction" instead.' }, 403);
  }

  const { amount, payment_mode, payment_type, payment_date, reference_note, status } = await request.json();
  const updates = [];
  const binds = [];
  if (amount !== undefined) { updates.push('amount = ?'); binds.push(amount); }
  if (payment_mode !== undefined) { updates.push('payment_mode = ?'); binds.push(payment_mode); }
  if (payment_type !== undefined) { updates.push('payment_type = ?'); binds.push(payment_type); }
  if (payment_date !== undefined) { updates.push('payment_date = ?'); binds.push(payment_date); }
  if (reference_note !== undefined) { updates.push('reference_note = ?'); binds.push(reference_note); }

  // Explicit lifecycle change (e.g. mark a payment 'voided' or 'refunded'
  // without deleting it -- keeps it on record for audit but stops it from
  // counting toward any balance, see functions/_ledger.js).
  if (status !== undefined) {
    if (!['posted', 'voided', 'refunded'].includes(status)) {
      return jsonResponse({ error: "status must be 'posted', 'voided' or 'refunded'" }, 400);
    }
    if (status !== 'posted' && (!reference_note || !reference_note.trim())) {
      return jsonResponse({ error: 'A reason is required when voiding or refunding a payment.' }, 400);
    }
    updates.push('status = ?', 'status_note = ?', 'status_by = ?', "status_at = datetime('now')");
    binds.push(status, reference_note || null, session.name);
  }

  if (updates.length === 0) return jsonResponse({ error: 'Nothing to update' }, 400);

  binds.push(params.id);
  await env.DB.prepare(`UPDATE payments SET ${updates.join(', ')} WHERE id = ?`).bind(...binds).run();

  await recomputeResidentLedger(env, payment.resident_id);
  return jsonResponse({ success: true });
}

export async function onRequestDelete({ request, env, params }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const payment = await env.DB.prepare('SELECT * FROM payments WHERE id = ?').bind(params.id).first();
  if (!payment) return jsonResponse({ error: 'Not found' }, 404);

  const canDelete = session.role === 'admin'
    || (session.role === 'pg_manager' && session.pgId === payment.pg_id);
  if (!canDelete) {
    return jsonResponse({ error: 'Only an admin or PG manager can delete a payment. Use "Flag a Correction" instead.' }, 403);
  }

  let reason = '';
  try {
    const body = await request.json();
    reason = (body && body.reason) ? String(body.reason).trim() : '';
  } catch { /* no body sent */ }
  if (!reason) return jsonResponse({ error: 'A reason is required to delete a payment.' }, 400);

  // Soft delete: the row stays on record (status='deleted') instead of
  // vanishing, so there's an audit trail of what was removed and why. Every
  // balance calculation filters to status IN ('posted','migrated'), so a
  // deleted payment stops counting immediately.
  await env.DB.prepare(
    `UPDATE payments SET status = 'deleted', status_note = ?, status_by = ?, status_at = datetime('now') WHERE id = ?`
  ).bind(reason, session.name, params.id).run();

  await recomputeResidentLedger(env, payment.resident_id);

  return jsonResponse({ success: true });
}
