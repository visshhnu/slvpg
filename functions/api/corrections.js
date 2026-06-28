// functions/api/corrections.js
import { requireAuth, jsonResponse, unauthorized, resolvePgId } from '../_auth.js';

export async function onRequestGet({ request, env }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const pgId = resolvePgId(session, url);
  if (!pgId) return jsonResponse({ error: 'pg_id is required' }, 400);

  const status = url.searchParams.get('status'); // optional filter, e.g. 'open'

  let query = 'SELECT * FROM corrections WHERE pg_id = ?';
  const binds = [pgId];
  if (status) {
    query += ' AND status = ?';
    binds.push(status);
  }
  query += ' ORDER BY created_at DESC';

  const { results } = await env.DB.prepare(query).bind(...binds).all();

  // Enrich each flag with a snapshot of the record it points to, so the admin
  // doesn't have to cross-reference manually.
  const enriched = [];
  for (const c of results) {
    let record = null;
    if (c.record_type === 'payment') {
      record = await env.DB.prepare(`
        SELECT p.*, res.name as resident_name FROM payments p
        LEFT JOIN residents res ON res.id = p.resident_id WHERE p.id = ?
      `).bind(c.record_id).first();
    } else if (c.record_type === 'expense') {
      record = await env.DB.prepare('SELECT * FROM expenses WHERE id = ?').bind(c.record_id).first();
    }
    enriched.push({ ...c, record });
  }

  return jsonResponse(enriched);
}

export async function onRequestPost({ request, env }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const pgId = resolvePgId(session, url);
  if (!pgId) return jsonResponse({ error: 'pg_id is required' }, 400);

  const { record_type, record_id, reason } = await request.json();
  if (!record_type || !record_id || !reason) {
    return jsonResponse({ error: 'record_type, record_id and reason are required' }, 400);
  }
  if (!['payment', 'expense'].includes(record_type)) {
    return jsonResponse({ error: 'record_type must be "payment" or "expense"' }, 400);
  }

  await env.DB.prepare(`
    INSERT INTO corrections (pg_id, record_type, record_id, raised_by, reason)
    VALUES (?, ?, ?, ?, ?)
  `).bind(pgId, record_type, record_id, session.name, reason).run();

  return jsonResponse({ success: true });
}
