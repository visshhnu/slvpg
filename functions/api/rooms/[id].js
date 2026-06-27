// functions/api/rooms/[id].js
import { requireAuth, jsonResponse, unauthorized } from '../../_auth.js';

export async function onRequestGet({ request, env, params }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const room = await env.DB.prepare('SELECT * FROM rooms WHERE id = ?').bind(params.id).first();
  if (!room) return jsonResponse({ error: 'Not found' }, 404);
  if (session.role !== 'admin' && room.pg_id !== session.pgId) return unauthorized();

  const { results: facilities } = await env.DB.prepare(
    'SELECT * FROM room_facilities WHERE room_id = ? ORDER BY id'
  ).bind(params.id).all();

  return jsonResponse({ ...room, facilities });
}

export async function onRequestPatch({ request, env, params }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const room = await env.DB.prepare('SELECT * FROM rooms WHERE id = ?').bind(params.id).first();
  if (!room) return jsonResponse({ error: 'Not found' }, 404);
  if (session.role !== 'admin' && room.pg_id !== session.pgId) return unauthorized();

  const body = await request.json();
  const allowed = ['monthly_rent', 'advance_deposit', 'refundable_amount', 'sharing_type', 'needs_maintenance', 'maintenance_note', 'notes'];
  const updates = [];
  const binds = [];
  for (const field of allowed) {
    if (field in body) {
      updates.push(`${field} = ?`);
      binds.push(field === 'needs_maintenance' ? (body[field] ? 1 : 0) : body[field]);
    }
  }
  if (updates.length === 0) return jsonResponse({ error: 'No valid fields to update' }, 400);

  binds.push(params.id);
  await env.DB.prepare(`UPDATE rooms SET ${updates.join(', ')} WHERE id = ?`).bind(...binds).run();
  return jsonResponse({ success: true });
}
