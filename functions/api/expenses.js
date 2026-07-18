// functions/api/expenses.js
import { requireAuth, jsonResponse, unauthorized, resolvePgId } from '../_auth.js';

// Full category list, matching what the owner explicitly asked to track:
// food ingredients, milk, electricity, water, wifi, and the rent management itself
// pays out to the landlord -- plus the categories from the spec doc.
export const EXPENSE_CATEGORIES = [
  'groceries', 'milk', 'electricity', 'water', 'wifi', 'landlord_rent',
  'salary', 'housekeeping', 'maintenance', 'repairs', 'plumbing',
  'furniture', 'personal_family', 'other',
];

export async function onRequestGet({ request, env }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const pgId = resolvePgId(session, url);
  if (!pgId) return jsonResponse({ error: 'pg_id is required' }, 400);

  const month = url.searchParams.get('month');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  let query = 'SELECT * FROM expenses WHERE pg_id = ?';
  const binds = [pgId];
  if (from && to) {
    // Date-range filter (used by Reports) -- `month` alone can't express a
    // multi-month range like "3 Months" or an arbitrary custom range.
    query += ' AND expense_date BETWEEN ? AND ?';
    binds.push(from, to);
  } else if (month) {
    query += ' AND expense_date LIKE ?';
    binds.push(`${month}%`);
  }
  query += ' ORDER BY expense_date DESC, created_at DESC';

  const { results } = await env.DB.prepare(query).bind(...binds).all();

  // Category breakdown for whatever set of rows was returned (handy for month-end summary)
  const byCategory = {};
  for (const e of results) {
    byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
  }
  const total = results.reduce((s, e) => s + e.amount, 0);

  return jsonResponse({ rows: results, by_category: byCategory, total });
}

export async function onRequestPost({ request, env }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const pgId = resolvePgId(session, url);
  if (!pgId) return jsonResponse({ error: 'pg_id is required' }, 400);

  const { category, description, amount, expense_date, paid_by, receipt_note } = await request.json();
  if (!category || !amount || amount <= 0) {
    return jsonResponse({ error: 'Category and a positive amount are required' }, 400);
  }

  await env.DB.prepare(`
    INSERT INTO expenses (pg_id, category, description, amount, expense_date, paid_by, receipt_note)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    pgId, category, description || null, amount,
    expense_date || new Date().toISOString().slice(0, 10),
    paid_by || session.name, receipt_note || null
  ).run();

  return jsonResponse({ success: true });
}
