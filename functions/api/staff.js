// functions/api/staff.js
import { requireAuth, jsonResponse, unauthorized } from '../_auth.js';
import { hashPassword } from '../_password.js';

// Attaches pg_ids (full assignment list) + pg_names to each staff row, from
// staff_pgs -- falls back to just [pg_id]/[pg_name] per row if that table
// isn't migrated on this DB yet, so this never breaks the whole staff list
// over one missing table.
async function attachPgAssignments(env, staffRows) {
  const byId = new Map(staffRows.map(s => [s.id, { ...s, pg_ids: s.pg_id ? [s.pg_id] : [], pg_names: s.pg_name ? [s.pg_name] : [] }]));
  if (staffRows.length === 0) return [...byId.values()];

  try {
    const ids = staffRows.map(s => s.id);
    const placeholders = ids.map(() => '?').join(',');
    const { results } = await env.DB.prepare(`
      SELECT sp.staff_id, sp.pg_id, p.name as pg_name
      FROM staff_pgs sp JOIN pgs p ON p.id = sp.pg_id
      WHERE sp.staff_id IN (${placeholders})
    `).bind(...ids).all();
    for (const row of results) {
      const entry = byId.get(row.staff_id);
      if (!entry) continue;
      if (!entry.pg_ids.includes(row.pg_id)) { entry.pg_ids.push(row.pg_id); entry.pg_names.push(row.pg_name); }
    }
  } catch {
    // staff_pgs not migrated yet -- each row already has its primary [pg_id] above
  }
  return [...byId.values()];
}

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
    return jsonResponse(await attachPgAssignments(env, results));
  }

  // Staff can only see their own primary PG's staff list (handy to know who
  // else covers the same property)
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

  const body = await request.json();
  const { name, phone, username, password, role } = body;
  // pg_ids (array) is the current form; pg_id (single) still accepted for
  // any older caller that hasn't been updated.
  const pgIdList = Array.isArray(body.pg_ids) ? body.pg_ids.filter(Boolean) : (body.pg_id ? [body.pg_id] : []);
  if (!name || !username || !password || pgIdList.length === 0) {
    return jsonResponse({ error: 'Name, username, password and at least one PG assignment are required' }, 400);
  }

  const assignedRole = role === 'pg_manager' ? 'pg_manager' : 'staff'; // never allow 'admin' via API

  const passwordHash = await hashPassword(password);

  try {
    const result = await env.DB.prepare(
      'INSERT INTO staff (pg_id, name, phone, username, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(pgIdList[0], name, phone || null, username.trim().toLowerCase(), passwordHash, assignedRole).run();

    if (pgIdList.length > 1) {
      const staffId = result.meta.last_row_id;
      try {
        await env.DB.batch(
          pgIdList.map(pgId => env.DB.prepare(
            'INSERT OR IGNORE INTO staff_pgs (staff_id, pg_id) VALUES (?, ?)'
          ).bind(staffId, pgId))
        );
      } catch {
        // staff_pgs not migrated yet on this DB -- the account is still
        // created and usable with just its primary PG (pgIdList[0]).
      }
    }

    return jsonResponse({ success: true });
  } catch (e) {
    if (String(e).includes('UNIQUE')) {
      return jsonResponse({ error: 'That username is already taken' }, 409);
    }
    throw e;
  }
}
