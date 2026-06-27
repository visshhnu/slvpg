// functions/api/rent.js
import { requireAuth, jsonResponse, unauthorized } from '../_auth.js';

// GET /api/rent?month=2026-06  -> ledger rows for that month (auto-creates missing rows for active residents)
export async function onRequestGet({ request, env }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const month = url.searchParams.get('month') || new Date().toISOString().slice(0, 7);

  // Auto-create ledger rows for any active resident missing one this month
  const { results: activeResidents } = await env.DB.prepare(`
    SELECT res.id, r.monthly_rent
    FROM residents res
    JOIN beds b ON b.id = res.bed_id
    JOIN rooms r ON r.id = b.room_id
    WHERE res.status IN ('active', 'notice_given')
  `).all();

  const dueDate = `${month}-05`;

  for (const res of activeResidents) {
    const exists = await env.DB.prepare(
      'SELECT id FROM rent_ledger WHERE resident_id = ? AND month = ?'
    ).bind(res.id, month).first();
    if (!exists) {
      await env.DB.prepare(
        `INSERT INTO rent_ledger (resident_id, month, due_date, amount_due, status)
         VALUES (?, ?, ?, ?, 'pending')`
      ).bind(res.id, month, dueDate, res.monthly_rent).run();
    }
  }

  const { results } = await env.DB.prepare(`
    SELECT
      rl.*, res.name as resident_name, res.phone as resident_phone, res.status as resident_status,
      r.floor, r.room_number, b.bed_label
    FROM rent_ledger rl
    JOIN residents res ON res.id = rl.resident_id
    LEFT JOIN beds b ON b.id = res.bed_id
    LEFT JOIN rooms r ON r.id = b.room_id
    WHERE rl.month = ?
    ORDER BY rl.status DESC, r.floor, r.room_number
  `).bind(month).all();

  // Mark overdue (past 5th, still pending/partial)
  const today = new Date().toISOString().slice(0, 10);
  const updated = results.map(row => {
    if ((row.status === 'pending' || row.status === 'partial') && today > row.due_date) {
      return { ...row, status: 'overdue' };
    }
    return row;
  });

  const summary = {
    month,
    total_due: updated.reduce((s, r) => s + r.amount_due, 0),
    total_paid: updated.reduce((s, r) => s + r.amount_paid, 0),
    total_pending: updated.reduce((s, r) => s + (r.amount_due - r.amount_paid), 0),
    overdue_count: updated.filter(r => r.status === 'overdue').length,
  };

  return jsonResponse({ summary, rows: updated });
}
