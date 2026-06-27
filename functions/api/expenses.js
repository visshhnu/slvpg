// functions/api/expenses.js
import { requireAuth, jsonResponse, unauthorized } from '../_auth.js';

export async function onRequestGet({ request, env }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const month = url.searchParams.get('month'); // 'YYYY-MM' optional

  let query = 'SELECT * FROM expenses';
  const binds = [];
  if (month) {
    query += ' WHERE expense_date LIKE ?';
    binds.push(`${month}%`);
  }
  query += ' ORDER BY expense_date DESC';

  const stmt = binds.length ? env.DB.prepare(query).bind(...binds) : env.DB.prepare(query);
  const { results } = await stmt.all();
  return jsonResponse(results);
}

export async function onRequestPost({ request, env }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const { category, description, amount, expense_date, paid_by } = await request.json();
  if (!category || !amount || amount <= 0) {
    return jsonResponse({ error: 'Category and a positive amount are required' }, 400);
  }

  await env.DB.prepare(`
    INSERT INTO expenses (category, description, amount, expense_date, paid_by)
    VALUES (?, ?, ?, ?, ?)
  `).bind(category, description || null, amount, expense_date || new Date().toISOString().slice(0, 10), paid_by || session.name).run();

  return jsonResponse({ success: true });
}
