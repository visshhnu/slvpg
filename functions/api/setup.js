// functions/api/setup.js
// Creates the very first owner account. Refuses to run if any staff already exist,
// so this is safe to leave deployed (it self-disables after first use).
import { jsonResponse } from '../_auth.js';
import { hashPassword } from '../_password.js';

export async function onRequestGet({ env }) {
  const existing = await env.DB.prepare('SELECT COUNT(*) as count FROM staff').first();
  return jsonResponse({ setupComplete: existing.count > 0 });
}

export async function onRequestPost({ request, env }) {
  const existing = await env.DB.prepare('SELECT COUNT(*) as count FROM staff').first();
  if (existing.count > 0) {
    return jsonResponse({ error: 'Setup already completed. Use the login page.' }, 403);
  }

  const { name, phone, username, password } = await request.json();
  if (!name || !username || !password) {
    return jsonResponse({ error: 'Name, username and password are required' }, 400);
  }
  if (password.length < 6) {
    return jsonResponse({ error: 'Password must be at least 6 characters' }, 400);
  }

  const passwordHash = await hashPassword(password);

  await env.DB.prepare(
    'INSERT INTO staff (name, phone, username, password_hash, role) VALUES (?, ?, ?, ?, ?)'
  ).bind(name, phone || null, username.trim().toLowerCase(), passwordHash, 'owner').run();

  return jsonResponse({ success: true });
}
