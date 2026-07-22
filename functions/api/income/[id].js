// functions/api/income/[id].js
import { requireAuth, jsonResponse, unauthorized } from '../../_auth.js';

export async function onRequestPatch({ request, env, params }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();
  if (session.role !== 'admin') {
    return jsonResponse({ error: 'Only an admin can edit an income entry' }, 403);
  }

  const body = await request.json();
  const allowed = ['amount', 'income_date', 'source', 'description'];
  const updates = [];
  const binds = [];
  for (const field of allowed) {
    if (field in body) {
      updates.push(`${field} = ?`);
      binds.push(body[field]);
    }
  }
  if (updates.length === 0) return jsonResponse({ error: 'Nothing to update' }, 400);

  binds.push(params.id);
  await env.DB.prepare(`UPDATE income SET ${updates.join(', ')} WHERE id = ?`).bind(...binds).run();
  return jsonResponse({ success: true });
}

export async function onRequestDelete({ request, env, params }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();
  if (session.role !== 'admin') {
    return jsonResponse({ error: 'Only an admin can delete an income entry' }, 403);
  }
  await env.DB.prepare('DELETE FROM income WHERE id = ?').bind(params.id).run();
  return jsonResponse({ success: true });
}
