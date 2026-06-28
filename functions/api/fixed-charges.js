// functions/api/fixed-charges.js
import { requireAuth, jsonResponse, unauthorized, resolvePgId } from '../_auth.js';

export async function onRequestGet({ request, env }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const pgId = resolvePgId(session, url);
  if (!pgId) return jsonResponse({ error: 'pg_id is required' }, 400);

  try {
    const { results } = await env.DB.prepare(
      'SELECT * FROM fixed_charges WHERE pg_id = ? ORDER BY label'
    ).bind(pgId).all();
    return jsonResponse(results);
  } catch (e) {
    // Migration 0003 not yet applied - return empty list gracefully
    if (String(e).includes('no such table')) return jsonResponse([]);
    throw e;
  }
}

export async function onRequestPost({ request, env }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const pgId = resolvePgId(session, url);
  if (!pgId) return jsonResponse({ error: 'pg_id is required' }, 400);

  const { label, category, amount, notes } = await request.json();
  if (!label || !category || !amount) {
    return jsonResponse({ error: 'Label, category and amount are required' }, 400);
  }

  try {
    const result = await env.DB.prepare(
      'INSERT INTO fixed_charges (pg_id, label, category, amount, notes) VALUES (?, ?, ?, ?, ?)'
    ).bind(pgId, label, category, amount, notes || null).run();
    return jsonResponse({ success: true, id: result.meta.last_row_id });
  } catch (e) {
    if (String(e).includes('UNIQUE')) {
      return jsonResponse({ error: 'A fixed charge with that label already exists for this PG' }, 409);
    }
    if (String(e).includes('no such table')) {
      return jsonResponse({ error: 'Database migration 0003 not yet applied. Run: wrangler d1 migrations apply svpg-manager-db --remote' }, 503);
    }
    throw e;
  }
}
