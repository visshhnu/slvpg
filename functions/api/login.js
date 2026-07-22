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

  // Full set of PGs this staff member can work in: their primary pg_id, plus
  // any extra assignments from staff_pgs (multi-PG staff). staff_pgs may not
  // exist yet on a DB that hasn't run the latest migration -- fall back to
  // just [pg_id] rather than failing login entirely.
  let pgIds = staff.pg_id ? [staff.pg_id] : [];
  try {
    const { results: extra } = await env.DB.prepare(
      'SELECT pg_id FROM staff_pgs WHERE staff_id = ?'
    ).bind(staff.id).all();
    for (const row of extra) {
      if (!pgIds.includes(row.pg_id)) pgIds.push(row.pg_id);
    }
  } catch {
    // staff_pgs table not migrated yet on this DB -- pgIds stays [pg_id]
  }

  const token = await createSessionToken(env, {
    staffId: staff.id,
    name: staff.name,
    role: staff.role,
    pgId: staff.pg_id || null,
    pgIds: pgIds.length > 0 ? pgIds : null,
  });

  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.append(
    'Set-Cookie',
    `pg_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`
  );

  return new Response(
    JSON.stringify({
      success: true, name: staff.name, role: staff.role,
      pgId: staff.pg_id || null, pgIds: pgIds.length > 0 ? pgIds : null,
    }),
    { headers }
  );
}
