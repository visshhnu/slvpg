// functions/api/staff.js
import { requireAuth, jsonResponse, unauthorized } from '../_auth.js';
import { hashPassword } from '../_password.js';

export async function onRequestGet({ request, env }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  if (session.role === 'admin') {
    const { results } = await env.DB.prepare(`
      SELECT s.id, s.name, s.phone, s.username, s.role, s.pg_id, p.name as pg_name, s.created_at
      FROM staff s
      LEFT JOIN pgs p ON p.id = s.pg_id
      ORDER BY s.created_at
    `).all();
    return jsonResponse(results);
  }

  // Staff can only see their own PG's staff list (handy to know who else covers the same property)
  const { results } = await env.DB.prepare(
    'SELECT id, name, phone, username, role, pg_id, created_at FROM staff WHERE pg_id = ? ORDER BY created_at'
  ).bind(session.pgId).all();
  return jsonResponse(results);
}

export async function onRequestPost({ request, env }) {
  const session = await requireAuth(request, env);
  if (!session || session.role !== 'admin') {
    return jsonResponse({ error: 'Only an admin can add staff accounts' }, 403);
  }

  const { name, phone, username, password, pg_id, role } = await request.json();
  if (!name || !username || !password || !pg_id) {
    return jsonResponse({ error: 'Name, username, password and a PG assignment are required' }, 400);
  }

  const assignedRole = role === 'pg_manager' ? 'pg_manager' : 'staff'; // never allow 'admin' via API

  const passwordHash = await hashPassword(password);

  try {
    await env.DB.prepare(
      'INSERT INTO staff (pg_id, name, phone, username, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(pg_id, name, phone || null, username.trim().toLowerCase(), passwordHash, assignedRole).run();
    return jsonResponse({ success: true });
  } catch (e) {
    if (String(e).includes('UNIQUE')) {
      return jsonResponse({ error: 'That username is already taken' }, 409);
    }
    throw e;
  }
}
