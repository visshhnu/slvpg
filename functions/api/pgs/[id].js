// functions/api/pgs/[id].js
import { requireAuth, jsonResponse, unauthorized } from '../../_auth.js';

export async function onRequestPatch({ request, env, params }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();
  if (session.role !== 'admin' && session.pgId !== parseInt(params.id, 10)) {
    return unauthorized();
  }

  const body = await request.json();
  const allowed = ['name', 'address', 'contact_phone', 'landlord_name', 'landlord_phone', 'notes'];
  const updates = [];
  const binds = [];
  for (const field of allowed) {
    if (field in body) {
      updates.push(`${field} = ?`);
      binds.push(body[field]);
    }
  }
  if (updates.length === 0) return jsonResponse({ error: 'No valid fields to update' }, 400);

  binds.push(params.id);
  await env.DB.prepare(`UPDATE pgs SET ${updates.join(', ')} WHERE id = ?`).bind(...binds).run();
  return jsonResponse({ success: true });
}
