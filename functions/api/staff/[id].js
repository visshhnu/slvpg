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

  const body = await request.json();
  const { role, password } = body;
  // pg_ids (array) is the current form; pg_id (single) still accepted.
  const pgIdList = Array.isArray(body.pg_ids) ? body.pg_ids.filter(Boolean)
    : (body.pg_id !== undefined && body.pg_id !== null ? [body.pg_id] : null);

  const updates = [];
  const binds = [];

  if (role !== undefined) {
    // Never allow setting role to 'admin' via API
    const safeRole = role === 'pg_manager' ? 'pg_manager' : 'staff';
    updates.push('role = ?');
    binds.push(safeRole);
  }

  if (pgIdList !== null) {
    if (pgIdList.length === 0) {
      return jsonResponse({ error: 'At least one PG assignment is required.' }, 400);
    }
    updates.push('pg_id = ?');
    binds.push(pgIdList[0]);
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

  // Replace the full staff_pgs set to match pgIdList exactly (delete then
  // re-insert, simpler and safer than diffing). Wrapped defensively since
  // staff_pgs may not exist yet on this DB -- pg_id (already updated above
  // to the primary PG) still works fine on its own either way.
  if (pgIdList !== null) {
    try {
      await env.DB.prepare('DELETE FROM staff_pgs WHERE staff_id = ?').bind(params.id).run();
      if (pgIdList.length > 1) {
        await env.DB.batch(
          pgIdList.map(pgId => env.DB.prepare(
            'INSERT OR IGNORE INTO staff_pgs (staff_id, pg_id) VALUES (?, ?)'
          ).bind(params.id, pgId))
        );
      }
    } catch {
      // staff_pgs not migrated yet -- pg_id (primary) is already saved above
    }
  }

  return jsonResponse({ success: true });
}
