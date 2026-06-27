// functions/api/pgs.js
import { requireAuth, jsonResponse, unauthorized } from '../_auth.js';

export async function onRequestGet({ request, env }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  if (session.role === 'admin') {
    const { results } = await env.DB.prepare('SELECT * FROM pgs ORDER BY name').all();
    return jsonResponse(results);
  }

  // Staff only sees their own PG
  const pg = await env.DB.prepare('SELECT * FROM pgs WHERE id = ?').bind(session.pgId).first();
  return jsonResponse(pg ? [pg] : []);
}

export async function onRequestPost({ request, env }) {
  const session = await requireAuth(request, env);
  if (!session || session.role !== 'admin') {
    return jsonResponse({ error: 'Only an admin can add a new PG' }, 403);
  }

  const { name, address, contact_phone, landlord_name, landlord_phone, notes } = await request.json();
  if (!name) return jsonResponse({ error: 'PG name is required' }, 400);

  const result = await env.DB.prepare(
    `INSERT INTO pgs (name, address, contact_phone, landlord_name, landlord_phone, notes)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(name, address || null, contact_phone || null, landlord_name || null, landlord_phone || null, notes || null).run();

  return jsonResponse({ success: true, id: result.meta.last_row_id });
}
