// functions/api/staff.js
import { requireAuth, jsonResponse, unauthorized } from '../_auth.js';
import { hashPassword } from '../_password.js';

export async function onRequestGet({ request, env }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const { results } = await env.DB.prepare(
    'SELECT id, name, phone, username, role, created_at FROM staff ORDER BY created_at'
  ).all();
  return jsonResponse(results);
}

export async function onRequestPost({ request, env }) {
  const session = await requireAuth(request, env);
  if (!session || session.role !== 'owner') {
    return jsonResponse({ error: 'Only the owner can add staff accounts' }, 403);
  }

  const { name, phone, username, password, role } = await request.json();
  if (!name || !username || !password) {
    return jsonResponse({ error: 'Name, username and password are required' }, 400);
  }

  const passwordHash = await hashPassword(password);

  try {
    await env.DB.prepare(
      'INSERT INTO staff (name, phone, username, password_hash, role) VALUES (?, ?, ?, ?, ?)'
    ).bind(name, phone || null, username.trim().toLowerCase(), passwordHash, role || 'staff').run();
    return jsonResponse({ success: true });
  } catch (e) {
    if (String(e).includes('UNIQUE')) {
      return jsonResponse({ error: 'That username is already taken' }, 409);
    }
    throw e;
  }
}
