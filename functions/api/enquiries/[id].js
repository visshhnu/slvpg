// functions/api/enquiries/[id].js
import { requireAuth, jsonResponse, unauthorized } from '../../_auth.js';

export async function onRequestPatch({ request, env, params }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const { status, notes } = await request.json();
  const allowed = ['new','contacted','converted','not_interested'];
  if (status && !allowed.includes(status)) return jsonResponse({ error: 'Invalid status' }, 400);

  const updates = []; const binds = [];
  if (status) { updates.push('status = ?'); binds.push(status); }
  if (notes !== undefined) { updates.push('notes = ?'); binds.push(notes); }
  if (!updates.length) return jsonResponse({ error: 'Nothing to update' }, 400);

  binds.push(params.id);
  try {
    await env.DB.prepare(`UPDATE enquiries SET ${updates.join(', ')} WHERE id = ?`).bind(...binds).run();
    return jsonResponse({ success: true });
  } catch(e) {
    if (String(e).includes('no such table')) return jsonResponse({ success: true });
    throw e;
  }
}
