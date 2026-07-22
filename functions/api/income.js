// functions/api/income.js
// For PGs where rent is collected in bulk rather than tracked per-resident.
// Deliberately kept as simple as expenses.js -- no correction-flagging
// workflow (that exists for payments/expenses because those tie back to
// specific residents and rent_ledger rows with real balances at stake;
// income here is a standalone lump-sum log with no such downstream state
// to keep consistent, so admin can just edit/delete it directly).
import { requireAuth, jsonResponse, unauthorized, resolvePgId } from '../_auth.js';

export async function onRequestGet({ request, env }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const pgId = resolvePgId(session, url);
  if (!pgId) return jsonResponse({ error: 'pg_id is required' }, 400);

  const month = url.searchParams.get('month');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  let query = 'SELECT * FROM income WHERE pg_id = ?';
  const binds = [pgId];
  if (from && to) {
    query += ' AND income_date BETWEEN ? AND ?';
    binds.push(from, to);
  } else if (month) {
    query += ' AND income_date LIKE ?';
    binds.push(`${month}%`);
  }
  query += ' ORDER BY income_date DESC, created_at DESC';

  const { results } = await env.DB.prepare(query).bind(...binds).all();
  const total = results.reduce((s, r) => s + r.amount, 0);

  return jsonResponse({ rows: results, total });
}

export async function onRequestPost({ request, env }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const pgId = resolvePgId(session, url);
  if (!pgId) return jsonResponse({ error: 'pg_id is required' }, 400);

  const { amount, income_date, source, description } = await request.json();
  if (!amount || amount <= 0 || !income_date) {
    return jsonResponse({ error: 'A positive amount and date are required' }, 400);
  }

  const result = await env.DB.prepare(`
    INSERT INTO income (pg_id, amount, income_date, source, description, recorded_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(pgId, amount, income_date, source || null, description || null, session.name).run();

  return jsonResponse({ success: true, id: result.meta.last_row_id });
}
