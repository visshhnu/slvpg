// functions/api/corrections/[id].js
import { requireAuth, jsonResponse, unauthorized } from '../../_auth.js';

// Recomputes rent_ledger from actual payment rows — always call after any
// payment edit/delete so the ledger never drifts out of sync.
async function recomputeLedger(env, rentLedgerId) {
  if (!rentLedgerId) return;
  const ledger = await env.DB.prepare('SELECT * FROM rent_ledger WHERE id = ?').bind(rentLedgerId).first();
  if (!ledger) return;
  const sum = await env.DB.prepare(
    'SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE rent_ledger_id = ? AND payment_type = "rent"'
  ).bind(rentLedgerId).first();
  const newPaid = sum.total;
  const newStatus = newPaid >= ledger.amount_due ? 'paid' : newPaid > 0 ? 'partial' : 'pending';
  await env.DB.prepare('UPDATE rent_ledger SET amount_paid = ?, status = ? WHERE id = ?')
    .bind(newPaid, newStatus, rentLedgerId).run();
}

export async function onRequestPatch({ request, env, params }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  // Both admin and pg_manager can resolve flags.
  // pg_manager can only touch corrections for their own PG.
  const canResolve = session.role === 'admin' || session.role === 'pg_manager';
  if (!canResolve) {
    return jsonResponse({ error: 'Only an admin or PG manager can resolve a correction flag.' }, 403);
  }

  const body = await request.json();
  const { status, resolution_note, fix_type, new_amount, new_payment_type } = body;

  if (!['resolved', 'dismissed'].includes(status)) {
    return jsonResponse({ error: 'status must be "resolved" or "dismissed"' }, 400);
  }

  // Load the correction so we know which payment/expense it points at
  const correction = await env.DB.prepare('SELECT * FROM corrections WHERE id = ?').bind(params.id).first();
  if (!correction) return jsonResponse({ error: 'Correction not found' }, 404);

  // pg_manager scope check: they can only resolve corrections for their own PG
  if (session.role === 'pg_manager' && session.pgId !== correction.pg_id) {
    return jsonResponse({ error: 'You can only manage corrections for your own PG.' }, 403);
  }

  if (status === 'resolved' && correction.record_type === 'payment') {
    const payment = await env.DB.prepare('SELECT * FROM payments WHERE id = ?').bind(correction.record_id).first();
    if (!payment) return jsonResponse({ error: 'Original payment record not found' }, 404);

    if (fix_type === 'remove') {
      // Payment was entered by mistake — delete it entirely and recompute
      if (!resolution_note || resolution_note.trim().length < 5) {
        return jsonResponse({ error: 'A reason is required when removing a payment.' }, 400);
      }
      await env.DB.prepare('DELETE FROM payments WHERE id = ?').bind(correction.record_id).run();
      await recomputeLedger(env, payment.rent_ledger_id);

    } else if (fix_type === 'fix_type') {
      // Payment type is wrong (e.g. advance logged as rent) — change the type
      // and recompute ledger since rent_ledger only tracks 'rent' payments
      if (!new_payment_type) return jsonResponse({ error: 'new_payment_type required' }, 400);
      await env.DB.prepare('UPDATE payments SET payment_type = ? WHERE id = ?')
        .bind(new_payment_type, correction.record_id).run();
      await recomputeLedger(env, payment.rent_ledger_id);

    } else if (fix_type === 'fix_amount') {
      // Amount is wrong — update it. Zero allowed only with a mandatory reason,
      // which then deletes the payment (same as 'remove').
      const amt = Number(new_amount);
      if (isNaN(amt) || amt < 0) return jsonResponse({ error: 'new_amount must be 0 or positive' }, 400);
      if (amt === 0) {
        if (!resolution_note || resolution_note.trim().length < 5) {
          return jsonResponse({ error: 'A reason is required when setting amount to zero (this removes the payment).' }, 400);
        }
        await env.DB.prepare('DELETE FROM payments WHERE id = ?').bind(correction.record_id).run();
      } else {
        await env.DB.prepare('UPDATE payments SET amount = ? WHERE id = ?').bind(amt, correction.record_id).run();
      }
      await recomputeLedger(env, payment.rent_ledger_id);
    }
  }

  if (status === 'resolved' && correction.record_type === 'expense' && fix_type === 'fix_amount') {
    const amt = Number(new_amount);
    if (isNaN(amt) || amt < 0) return jsonResponse({ error: 'new_amount must be 0 or positive' }, 400);
    if (amt === 0) {
      if (!resolution_note || resolution_note.trim().length < 5) {
        return jsonResponse({ error: 'A reason is required when removing an expense.' }, 400);
      }
      await env.DB.prepare('DELETE FROM expenses WHERE id = ?').bind(correction.record_id).run();
    } else {
      await env.DB.prepare('UPDATE expenses SET amount = ? WHERE id = ?').bind(amt, correction.record_id).run();
    }
  }

  await env.DB.prepare(`
    UPDATE corrections SET status = ?, resolved_by = ?, resolution_note = ?, resolved_at = datetime('now')
    WHERE id = ?
  `).bind(status, session.name, resolution_note || null, params.id).run();

  return jsonResponse({ success: true });
}
