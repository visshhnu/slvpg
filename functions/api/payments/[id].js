// functions/api/payments/[id].js
import { requireAuth, jsonResponse, unauthorized } from '../../_auth.js';

// Recomputes a rent_ledger row's amount_paid/status from scratch based on
// every payment still linked to it. Called after any edit or delete so the
// ledger never drifts out of sync with the underlying payment records.
async function recomputeLedger(env, rentLedgerId) {
  if (!rentLedgerId) return;
  const ledgerRow = await env.DB.prepare('SELECT * FROM rent_ledger WHERE id = ?').bind(rentLedgerId).first();
  if (!ledgerRow) return;

  const sum = await env.DB.prepare(
    'SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE rent_ledger_id = ?'
  ).bind(rentLedgerId).first();

  const newPaid = sum.total;
  let newStatus = 'pending';
  if (newPaid >= ledgerRow.amount_due) newStatus = 'paid';
  else if (newPaid > 0) newStatus = 'partial';

  await env.DB.prepare(
    'UPDATE rent_ledger SET amount_paid = ?, status = ? WHERE id = ?'
  ).bind(newPaid, newStatus, rentLedgerId).run();
}

export async function onRequestPatch({ request, env, params }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();
  if (session.role !== 'admin') {
    return jsonResponse({ error: 'Only an admin can edit a payment. Use "Flag a Correction" instead.' }, 403);
  }

  const payment = await env.DB.prepare('SELECT * FROM payments WHERE id = ?').bind(params.id).first();
  if (!payment) return jsonResponse({ error: 'Not found' }, 404);

  const { amount, payment_mode, payment_type, payment_date, reference_note } = await request.json();
  const updates = [];
  const binds = [];
  if (amount !== undefined) { updates.push('amount = ?'); binds.push(amount); }
  if (payment_mode !== undefined) { updates.push('payment_mode = ?'); binds.push(payment_mode); }
  if (payment_type !== undefined) { updates.push('payment_type = ?'); binds.push(payment_type); }
  if (payment_date !== undefined) { updates.push('payment_date = ?'); binds.push(payment_date); }
  if (reference_note !== undefined) { updates.push('reference_note = ?'); binds.push(reference_note); }
  if (updates.length === 0) return jsonResponse({ error: 'Nothing to update' }, 400);

  binds.push(params.id);
  await env.DB.prepare(`UPDATE payments SET ${updates.join(', ')} WHERE id = ?`).bind(...binds).run();

  await recomputeLedger(env, payment.rent_ledger_id);
  return jsonResponse({ success: true });
}

export async function onRequestDelete({ request, env, params }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();
  if (session.role !== 'admin') {
    return jsonResponse({ error: 'Only an admin can delete a payment. Use "Flag a Correction" instead.' }, 403);
  }

  const payment = await env.DB.prepare('SELECT * FROM payments WHERE id = ?').bind(params.id).first();
  if (!payment) return jsonResponse({ error: 'Not found' }, 404);

  await env.DB.prepare('DELETE FROM payments WHERE id = ?').bind(params.id).run();
  await recomputeLedger(env, payment.rent_ledger_id);

  return jsonResponse({ success: true });
}
