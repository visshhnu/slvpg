// functions/api/login.js
import { createSessionToken, jsonResponse } from '../_auth.js';
import { verifyPassword } from '../_password.js';

export async function onRequestPost({ request, env }) {
  const { username, password } = await request.json();
  if (!username || !password) {
    return jsonResponse({ error: 'Username and password required' }, 400);
  }

  const staff = await env.DB.prepare(
    'SELECT * FROM staff WHERE username = ?'
  ).bind(username.trim().toLowerCase()).first();

  if (!staff) {
    return jsonResponse({ error: 'Invalid username or password' }, 401);
  }

  const valid = await verifyPassword(password, staff.password_hash);
  if (!valid) {
    return jsonResponse({ error: 'Invalid username or password' }, 401);
  }

  const token = await createSessionToken(env, {
    staffId: staff.id,
    name: staff.name,
    role: staff.role,
    pgId: staff.pg_id || null,
  });

  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.append(
    'Set-Cookie',
    `pg_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`
  );

  return new Response(
    JSON.stringify({ success: true, name: staff.name, role: staff.role, pgId: staff.pg_id || null }),
    { headers }
  );
}
