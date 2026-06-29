// functions/api/dashboard.js
import { requireAuth, jsonResponse, unauthorized, resolvePgId } from '../_auth.js';
import { ensureLedgerRows } from '../_rent.js';

export async function onRequestGet({ request, env }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const pgId = resolvePgId(session, url);
  if (!pgId) return jsonResponse({ error: 'pg_id is required' }, 400);

  const today = new Date().toISOString().slice(0, 10);
  const thisMonth = today.slice(0, 7);
  const nextMonthDate = new Date();
  nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
  const nextMonth = nextMonthDate.toISOString().slice(0, 7);

  // IMPORTANT: create any missing rent_ledger rows for this month BEFORE summing,
  // the same way the Rent tab does. Without this, residents who haven't had a
  // ledger row created yet are invisible to the totals below.
  await ensureLedgerRows(env, pgId, thisMonth);

  const [
    totalBeds, occupiedBeds, activeResidents, vacatingNext,
    rentRows, expenseRows, noticesGiven, maintenanceRooms, advanceRows
  ] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) as c FROM beds b JOIN rooms r ON r.id = b.room_id WHERE r.pg_id = ?').bind(pgId).first(),
    env.DB.prepare(`
      SELECT COUNT(DISTINCT res.bed_id) as c FROM residents res
      JOIN beds b ON b.id = res.bed_id JOIN rooms r ON r.id = b.room_id
      WHERE r.pg_id = ? AND res.status != 'vacated' AND res.bed_id IS NOT NULL
    `).bind(pgId).first(),
    env.DB.prepare(`SELECT COUNT(*) as c FROM residents WHERE pg_id = ? AND status != 'vacated'`).bind(pgId).first(),
    env.DB.prepare(`
      SELECT COUNT(*) as c FROM residents
      WHERE pg_id = ? AND status = 'notice_given' AND planned_vacate_date LIKE ?
    `).bind(pgId, `${nextMonth}%`).first(),
    env.DB.prepare(`SELECT amount_due, amount_paid, status FROM rent_ledger WHERE pg_id = ? AND month = ?`).bind(pgId, thisMonth).all(),
    env.DB.prepare(`SELECT category, amount FROM expenses WHERE pg_id = ? AND expense_date LIKE ?`).bind(pgId, `${thisMonth}%`).all(),
    env.DB.prepare(`
      SELECT res.id, res.name, res.notice_date, res.planned_vacate_date, r.floor, r.room_number, b.bed_label
      FROM residents res
      LEFT JOIN beds b ON b.id = res.bed_id
      LEFT JOIN rooms r ON r.id = b.room_id
      WHERE res.pg_id = ? AND res.status = 'notice_given'
      ORDER BY res.planned_vacate_date ASC
    `).bind(pgId).all(),
    env.DB.prepare(`SELECT id, floor, room_number, maintenance_note FROM rooms WHERE pg_id = ? AND needs_maintenance = 1`).bind(pgId).all(),
    env.DB.prepare(`
      SELECT res.advance_paid, r.advance_deposit
      FROM residents res
      LEFT JOIN beds b ON b.id = res.bed_id
      LEFT JOIN rooms r ON r.id = b.room_id
      WHERE res.pg_id = ? AND res.status != 'vacated'
    `).bind(pgId).all(),
  ]);

  const rentTotalDue = rentRows.results.reduce((s, r) => s + r.amount_due, 0);
  const rentTotalPaid = rentRows.results.reduce((s, r) => s + r.amount_paid, 0);

  const expenseByCategory = {};
  for (const e of expenseRows.results) {
    expenseByCategory[e.category] = (expenseByCategory[e.category] || 0) + e.amount;
  }
  const expenseTotal = expenseRows.results.reduce((s, r) => s + r.amount, 0);

  const advanceTotalDue = advanceRows.results.reduce((s, r) => s + (r.advance_deposit || 0), 0);
  const advanceTotalCollected = advanceRows.results.reduce((s, r) => s + (r.advance_paid || 0), 0);

  // Refund eligibility check for anyone with a notice on file (30-day rule)
  const noticesWithEligibility = noticesGiven.results.map(n => {
    if (!n.notice_date || !n.planned_vacate_date) return { ...n, eligible: null, notice_days_given: null };
    const days = Math.round((new Date(n.planned_vacate_date) - new Date(n.notice_date)) / 86400000);
    return { ...n, notice_days_given: days, eligible: days >= 30 };
  });

  return jsonResponse({
    total_beds: totalBeds.c,
    occupied_beds: occupiedBeds.c,
    vacant_beds: totalBeds.c - occupiedBeds.c,
    active_residents: activeResidents.c,
    vacating_next_month: vacatingNext.c,
    notices: noticesWithEligibility,
    maintenance_rooms: maintenanceRooms.results,
    this_month: thisMonth,
    rent_collected: rentTotalPaid,
    rent_pending: rentTotalDue - rentTotalPaid,
    advance_collected: advanceTotalCollected,
    advance_pending: advanceTotalDue - advanceTotalCollected,
    expenses_this_month: expenseTotal,
    expenses_by_category: expenseByCategory,
    net_this_month: rentTotalPaid - expenseTotal,
  });
}
