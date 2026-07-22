// functions/api/fixed-charges/[id].js
import { requireAuth, jsonResponse, unauthorized, isPgAllowed } from '../../_auth.js';

export async function onRequestPatch({ request, env, params }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const existing = await env.DB.prepare('SELECT pg_id FROM fixed_charges WHERE id = ?').bind(params.id).first();
  if (!existing) return jsonResponse({ error: 'Not found' }, 404);
  if (!isPgAllowed(session, existing.pg_id)) return unauthorized();

  const { label, category, amount, notes } = await request.json();
  const updates = [];
  const binds = [];
  if (label !== undefined) { updates.push('label = ?'); binds.push(label); }
  if (category !== undefined) { updates.push('category = ?'); binds.push(category); }
  if (amount !== undefined) { updates.push('amount = ?'); binds.push(amount); }
  if (notes !== undefined) { updates.push('notes = ?'); binds.push(notes); }
  updates.push('updated_at = ?');
  binds.push(new Date().toISOString());

  if (updates.length === 1) return jsonResponse({ error: 'Nothing to update' }, 400);

  binds.push(params.id);
  await env.DB.prepare(`UPDATE fixed_charges SET ${updates.join(', ')} WHERE id = ?`).bind(...binds).run();
  return jsonResponse({ success: true });
}

export async function onRequestDelete({ request, env, params }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const existing = await env.DB.prepare('SELECT pg_id FROM fixed_charges WHERE id = ?').bind(params.id).first();
  if (!existing) return jsonResponse({ error: 'Not found' }, 404);
  if (!isPgAllowed(session, existing.pg_id)) return unauthorized();

  await env.DB.prepare('DELETE FROM fixed_charges WHERE id = ?').bind(params.id).run();
  return jsonResponse({ success: true });
}
