// functions/api/corrections/[id].js
import { requireAuth, jsonResponse, unauthorized } from '../../_auth.js';

export async function onRequestPatch({ request, env, params }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();
  if (session.role !== 'admin') {
    return jsonResponse({ error: 'Only an admin can resolve a correction flag' }, 403);
  }

  const { status, resolution_note } = await request.json();
  if (!['resolved', 'dismissed'].includes(status)) {
    return jsonResponse({ error: 'status must be "resolved" or "dismissed"' }, 400);
  }

  await env.DB.prepare(`
    UPDATE corrections SET status = ?, resolved_by = ?, resolution_note = ?, resolved_at = datetime('now')
    WHERE id = ?
  `).bind(status, session.name, resolution_note || null, params.id).run();

  return jsonResponse({ success: true });
}
