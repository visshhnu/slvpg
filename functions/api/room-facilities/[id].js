// functions/api/room-facilities/[id].js
import { requireAuth, jsonResponse, unauthorized } from '../../_auth.js';

export async function onRequestPatch({ request, env, params }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const { condition, quantity, notes } = await request.json();
  const updates = [];
  const binds = [];
  if (condition) { updates.push('condition = ?'); binds.push(condition); }
  if (quantity !== undefined) { updates.push('quantity = ?'); binds.push(quantity); }
  if (notes !== undefined) { updates.push('notes = ?'); binds.push(notes); }
  if (updates.length === 0) return jsonResponse({ error: 'Nothing to update' }, 400);

  binds.push(params.id);
  await env.DB.prepare(`UPDATE room_facilities SET ${updates.join(', ')} WHERE id = ?`).bind(...binds).run();
  return jsonResponse({ success: true });
}
