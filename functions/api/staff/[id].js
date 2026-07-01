// functions/api/staff/[id].js
import { requireAuth, jsonResponse, unauthorized } from '../../_auth.js';
import { hashPassword } from '../../_password.js';

export async function onRequestPatch({ request, env, params }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();
  if (session.role !== 'admin') {
    return jsonResponse({ error: 'Only an admin can edit staff accounts.' }, 403);
  }

  const target = await env.DB.prepare('SELECT * FROM staff WHERE id = ?').bind(params.id).first();
  if (!target) return jsonResponse({ error: 'Staff member not found.' }, 404);

  // Never allow editing the admin account via this endpoint
  if (target.role === 'admin') {
    return jsonResponse({ error: 'Admin account cannot be edited here.' }, 403);
  }

  const { role, pg_id, password } = await request.json();

  const updates = [];
  const binds = [];

  if (role !== undefined) {
    // Never allow setting role to 'admin' via API
    const safeRole = role === 'pg_manager' ? 'pg_manager' : 'staff';
    updates.push('role = ?');
    binds.push(safeRole);
  }

  if (pg_id !== undefined) {
    updates.push('pg_id = ?');
    binds.push(pg_id);
  }

  if (password) {
    if (password.length < 6) {
      return jsonResponse({ error: 'Password must be at least 6 characters.' }, 400);
    }
    const hash = await hashPassword(password);
    updates.push('password_hash = ?');
    binds.push(hash);
  }

  if (updates.length === 0) return jsonResponse({ error: 'Nothing to update.' }, 400);

  binds.push(params.id);
  await env.DB.prepare(`UPDATE staff SET ${updates.join(', ')} WHERE id = ?`).bind(...binds).run();

  return jsonResponse({ success: true });
}
