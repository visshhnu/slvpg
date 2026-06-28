// functions/api/enquiries.js — PUBLIC POST (no auth), authenticated GET
import { requireAuth, jsonResponse, unauthorized, resolvePgId } from '../_auth.js';

export async function onRequestPost({ request, env }) {
  const body = await request.json();
  const { name, phone, room_type, move_in_date, occupation, message, pg_id } = body;
  if (!name || !phone) return jsonResponse({ error: 'Name and phone are required' }, 400);

  try {
    await env.DB.prepare(`
      INSERT INTO enquiries (pg_id, name, phone, room_type, move_in_date, occupation, message)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(pg_id || 1, name, phone, room_type || null, move_in_date || null, occupation || null, message || null).run();
    return jsonResponse({ success: true });
  } catch(e) {
    if (String(e).includes('no such table')) return jsonResponse({ success: true }); // graceful if migration pending
    throw e;
  }
}

export async function onRequestGet({ request, env }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const pgId = resolvePgId(session, url) || 1;
  const status = url.searchParams.get('status');

  let q = `SELECT * FROM enquiries WHERE pg_id = ?`;
  const binds = [pgId];
  if (status) { q += ' AND status = ?'; binds.push(status); }
  q += ' ORDER BY created_at DESC LIMIT 100';

  try {
    const { results } = await env.DB.prepare(q).bind(...binds).all();
    return jsonResponse(results);
  } catch(e) {
    if (String(e).includes('no such table')) return jsonResponse([]);
    throw e;
  }
}
