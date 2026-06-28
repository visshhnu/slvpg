// functions/api/pgs/[id].js
import { requireAuth, jsonResponse, unauthorized } from '../../_auth.js';

export async function onRequestPatch({ request, env, params }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();
  if (session.role !== 'admin' && session.pgId !== parseInt(params.id, 10)) {
    return unauthorized();
  }

  const body = await request.json();
  const allowed = [
    'name', 'address', 'contact_phone', 'landlord_name', 'landlord_phone', 'notes',
    'tagline', 'description', 'amenities', 'house_rules', 'photos',
    'property_page_enabled',
    'single_rent', 'double_rent', 'triple_rent',
    'single_advance', 'double_advance', 'triple_advance',
  ];
  const updates = [];
  const binds = [];
  for (const field of allowed) {
    if (field in body) {
      updates.push(`${field} = ?`);
      // JSON-stringify arrays before storing
      const val = Array.isArray(body[field]) ? JSON.stringify(body[field]) : body[field];
      binds.push(val);
    }
  }
  if (updates.length === 0) return jsonResponse({ error: 'No valid fields to update' }, 400);

  binds.push(params.id);
  try {
    await env.DB.prepare(`UPDATE pgs SET ${updates.join(', ')} WHERE id = ?`).bind(...binds).run();
  } catch (e) {
    // Migration 0005 not yet applied
    if (String(e).includes('no such column')) {
      const basicAllowed = ['name', 'address', 'contact_phone', 'landlord_name', 'landlord_phone', 'notes'];
      const bu = []; const bb = [];
      for (const f of basicAllowed) {
        if (f in body) { bu.push(`${f} = ?`); bb.push(body[f]); }
      }
      if (bu.length > 0) {
        bb.push(params.id);
        await env.DB.prepare(`UPDATE pgs SET ${bu.join(', ')} WHERE id = ?`).bind(...bb).run();
      }
    } else throw e;
  }
  return jsonResponse({ success: true });
}
