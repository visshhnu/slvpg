// functions/api/room-facilities/[id].js
// GET/PATCH a specific facility item; POST adds a new item to a room
import { requireAuth, jsonResponse, unauthorized } from '../../_auth.js';

export async function onRequestPost({ request, env, params }) {
  // params.id here = room_id (adding item to a room)
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const { item_name, quantity, condition, notes } = await request.json();
  if (!item_name) return jsonResponse({ error: 'Item name is required' }, 400);

  const result = await env.DB.prepare(
    `INSERT INTO room_facilities (room_id, item_name, quantity, condition, notes)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(params.id, item_name, quantity || 1, condition || 'good', notes || null).run();

  return jsonResponse({ success: true, id: result.meta.last_row_id });
}

export async function onRequestPatch({ request, env, params }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const { condition, quantity, notes } = await request.json();
  const updates = [];
  const binds = [];
  if (condition !== undefined) { updates.push('condition = ?'); binds.push(condition); }
  if (quantity !== undefined) { updates.push('quantity = ?'); binds.push(quantity); }
  if (notes !== undefined) { updates.push('notes = ?'); binds.push(notes); }
  if (updates.length === 0) return jsonResponse({ error: 'Nothing to update' }, 400);

  binds.push(params.id);
  await env.DB.prepare(`UPDATE room_facilities SET ${updates.join(', ')} WHERE id = ?`).bind(...binds).run();
  return jsonResponse({ success: true });
}
