// functions/api/setup.js
// Creates the very first admin account (and, if none exists yet, the first PG too).
// Refuses to run if any staff already exist, so this is safe to leave deployed.
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

  const { name, phone, username, password, pgName } = await request.json();
  if (!name || !username || !password) {
    return jsonResponse({ error: 'Name, username and password are required' }, 400);
  }
  if (password.length < 6) {
    return jsonResponse({ error: 'Password must be at least 6 characters' }, 400);
  }

  // If no PG exists yet (fresh database with no seed run), create one from the name given.
  const pgCount = await env.DB.prepare('SELECT COUNT(*) as count FROM pgs').first();
  if (pgCount.count === 0) {
    await env.DB.prepare('INSERT INTO pgs (name) VALUES (?)').bind(pgName || 'My PG').run();
  }

  const passwordHash = await hashPassword(password);

  // pg_id is NULL -> this account is an admin, sees every PG
  await env.DB.prepare(
    'INSERT INTO staff (pg_id, name, phone, username, password_hash, role) VALUES (NULL, ?, ?, ?, ?, ?)'
  ).bind(name, phone || null, username.trim().toLowerCase(), passwordHash, 'admin').run();

  return jsonResponse({ success: true });
}
