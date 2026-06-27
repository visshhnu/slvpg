// functions/api/dashboard.js
import { requireAuth, jsonResponse, unauthorized } from '../_auth.js';

export async function onRequestGet({ request, env }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const today = new Date().toISOString().slice(0, 10);
  const thisMonth = today.slice(0, 7);
  const nextMonthDate = new Date();
  nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
  const nextMonth = nextMonthDate.toISOString().slice(0, 7);

  const [totalBeds, occupiedBeds, activeResidents, vacatingNext, rentRows, expenseRows, noticesGiven] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) as c FROM beds').first(),
    env.DB.prepare(`SELECT COUNT(DISTINCT bed_id) as c FROM residents WHERE status != 'vacated' AND bed_id IS NOT NULL`).first(),
    env.DB.prepare(`SELECT COUNT(*) as c FROM residents WHERE status != 'vacated'`).first(),
    env.DB.prepare(`
      SELECT COUNT(*) as c FROM residents
      WHERE status = 'notice_given' AND planned_vacate_date LIKE ?
    `).bind(`${nextMonth}%`).first(),
    env.DB.prepare(`SELECT amount_due, amount_paid, status FROM rent_ledger WHERE month = ?`).bind(thisMonth).all(),
    env.DB.prepare(`SELECT amount FROM expenses WHERE expense_date LIKE ?`).bind(`${thisMonth}%`).all(),
    env.DB.prepare(`
      SELECT res.id, res.name, res.notice_date, res.planned_vacate_date, r.floor, r.room_number, b.bed_label
      FROM residents res
      LEFT JOIN beds b ON b.id = res.bed_id
      LEFT JOIN rooms r ON r.id = b.room_id
      WHERE res.status = 'notice_given'
      ORDER BY res.planned_vacate_date ASC
    `).all(),
  ]);

  const rentTotalDue = rentRows.results.reduce((s, r) => s + r.amount_due, 0);
  const rentTotalPaid = rentRows.results.reduce((s, r) => s + r.amount_paid, 0);
  const expenseTotal = expenseRows.results.reduce((s, r) => s + r.amount, 0);

  return jsonResponse({
    total_beds: totalBeds.c,
    occupied_beds: occupiedBeds.c,
    vacant_beds: totalBeds.c - occupiedBeds.c,
    active_residents: activeResidents.c,
    vacating_next_month: vacatingNext.c,
    notices: noticesGiven.results,
    this_month: thisMonth,
    rent_collected: rentTotalPaid,
    rent_pending: rentTotalDue - rentTotalPaid,
    expenses_this_month: expenseTotal,
    net_this_month: rentTotalPaid - expenseTotal,
  });
}
