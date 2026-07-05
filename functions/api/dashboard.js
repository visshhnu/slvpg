// functions/api/dashboard.js
import { requireAuth, jsonResponse, unauthorized, resolvePgId } from '../_auth.js';
import { ensureLedgerRows } from '../_ledger.js';

function toDateStr(d) { return d.toISOString().slice(0, 10); }

// Resolve a `range` query param into a concrete [from, to] date pair (inclusive).
// Falls back to "this calendar month so far" when no range/from/to is given,
// which matches the dashboard's original default behaviour.
function resolvePeriod(url) {
  const range = url.searchParams.get('range') || 'this_month';
  const today = new Date();
  const todayStr = toDateStr(today);

  if (range === 'custom') {
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    if (from && to) return { key: 'custom', from, to, label: `${from} to ${to}` };
    // Fall through to this_month if custom was picked but dates are missing
  }

  if (range === 'yesterday') {
    const y = new Date(today); y.setDate(y.getDate() - 1);
    const ys = toDateStr(y);
    return { key: 'yesterday', from: ys, to: ys, label: 'Yesterday' };
  }
  if (range === 'today') {
    return { key: 'today', from: todayStr, to: todayStr, label: 'Today' };
  }
  if (range === '7d') {
    const from = new Date(today); from.setDate(from.getDate() - 6);
    return { key: '7d', from: toDateStr(from), to: todayStr, label: 'Last 7 days' };
  }
  if (range === '1m') {
    const from = new Date(today); from.setMonth(from.getMonth() - 1);
    return { key: '1m', from: toDateStr(from), to: todayStr, label: 'Last 1 month' };
  }
  if (range === '3m') {
    const from = new Date(today); from.setMonth(from.getMonth() - 3);
    return { key: '3m', from: toDateStr(from), to: todayStr, label: 'Last 3 months' };
  }

  // Default: this_month — calendar month start through today
  const from = `${todayStr.slice(0, 7)}-01`;
  return { key: 'this_month', from, to: todayStr, label: 'This month' };
}

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

  const period = resolvePeriod(url);

  // IMPORTANT: create any missing rent_ledger rows for the CURRENT month before
  // summing pending. Pending is always "right now", independent of the period
  // filter above — it doesn't make sense to ask "what was pending yesterday".
  await ensureLedgerRows(env, pgId, thisMonth);

  const [
    totalBeds, occupiedBeds, reservedBeds, activeResidents, vacatingNext,
    rentRows, noticesGiven, maintenanceRooms, advanceRows,
    rentPaymentsInPeriod, advancePaymentsInPeriod, expensesInPeriod, bookingsInPeriod,
    sharingTypeBreakdown
  ] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) as c FROM beds b JOIN rooms r ON r.id = b.room_id WHERE r.pg_id = ?').bind(pgId).first(),
    // Genuinely occupied = resident has actually moved in (join_date has arrived)
    env.DB.prepare(`
      SELECT COUNT(DISTINCT res.bed_id) as c FROM residents res
      JOIN beds b ON b.id = res.bed_id JOIN rooms r ON r.id = b.room_id
      WHERE r.pg_id = ? AND res.status != 'vacated' AND res.bed_id IS NOT NULL AND res.join_date <= ?
    `).bind(pgId, today).first(),
    // Reserved = booked but join_date hasn't arrived yet — held, not vacant, not occupied
    env.DB.prepare(`
      SELECT COUNT(DISTINCT res.bed_id) as c FROM residents res
      JOIN beds b ON b.id = res.bed_id JOIN rooms r ON r.id = b.room_id
      WHERE r.pg_id = ? AND res.status != 'vacated' AND res.bed_id IS NOT NULL AND res.join_date > ?
    `).bind(pgId, today).first(),
    env.DB.prepare(`SELECT COUNT(*) as c FROM residents WHERE pg_id = ? AND status != 'vacated'`).bind(pgId).first(),
    env.DB.prepare(`
      SELECT COUNT(*) as c FROM residents
      WHERE pg_id = ? AND status = 'notice_given' AND planned_vacate_date LIKE ?
    `).bind(pgId, `${nextMonth}%`).first(),
    env.DB.prepare(`SELECT amount_due, amount_paid, status FROM rent_ledger WHERE pg_id = ? AND month = ?`).bind(pgId, thisMonth).all(),
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
    // Period-based actuals: driven by real transaction dates, so any range works
    // (yesterday, today, 7 days, custom — not just "this calendar month").
    env.DB.prepare(`SELECT amount FROM payments WHERE pg_id = ? AND payment_type = 'rent' AND status IN ('posted', 'migrated') AND payment_date BETWEEN ? AND ?`).bind(pgId, period.from, period.to).all(),
    env.DB.prepare(`SELECT amount FROM payments WHERE pg_id = ? AND payment_type = 'advance' AND status IN ('posted', 'migrated') AND payment_date BETWEEN ? AND ?`).bind(pgId, period.from, period.to).all(),
    env.DB.prepare(`SELECT category, amount FROM expenses WHERE pg_id = ? AND expense_date BETWEEN ? AND ?`).bind(pgId, period.from, period.to).all(),
    // Bookings (by actual join_date, not when the record was entered into the
    // system) — works for past joins AND future/upcoming bookings, since a
    // Custom range with a future "to" date will naturally include them.
    env.DB.prepare(`
      SELECT res.id, res.name, res.join_date, res.status, res.advance_paid,
        r.floor, r.room_number, r.advance_deposit, b.bed_label
      FROM residents res
      LEFT JOIN beds b ON b.id = res.bed_id
      LEFT JOIN rooms r ON r.id = b.room_id
      WHERE res.pg_id = ? AND res.join_date BETWEEN ? AND ?
      ORDER BY res.join_date ASC
    `).bind(pgId, period.from, period.to).all(),
    // Sharing-type breakdown: how many single-sharing vs double-sharing beds
    // are occupied right now vs total, for the occupancy card.
    env.DB.prepare(`
      SELECT r.sharing_type,
        COUNT(DISTINCT b.id) as total_beds,
        COUNT(DISTINCT CASE WHEN res.id IS NOT NULL AND res.status != 'vacated' AND res.join_date <= ? THEN b.id END) as occupied_beds
      FROM rooms r
      JOIN beds b ON b.room_id = r.id
      LEFT JOIN residents res ON res.bed_id = b.id AND res.status != 'vacated'
      WHERE r.pg_id = ?
      GROUP BY r.sharing_type
    `).bind(today, pgId).all(),
  ]);

  const rentTotalDue = rentRows.results.reduce((s, r) => s + r.amount_due, 0);
  const rentTotalPaid = rentRows.results.reduce((s, r) => s + r.amount_paid, 0);

  const expenseByCategory = {};
  for (const e of expensesInPeriod.results) {
    expenseByCategory[e.category] = (expenseByCategory[e.category] || 0) + e.amount;
  }
  const expenseTotal = expensesInPeriod.results.reduce((s, r) => s + r.amount, 0);

  const rentCollectedInPeriod = rentPaymentsInPeriod.results.reduce((s, r) => s + r.amount, 0);
  const advanceCollectedInPeriod = advancePaymentsInPeriod.results.reduce((s, r) => s + r.amount, 0);

  const advanceTotalDue = advanceRows.results.reduce((s, r) => s + (r.advance_deposit || 0), 0);
  const advanceTotalCollected = advanceRows.results.reduce((s, r) => s + (r.advance_paid || 0), 0);

  // Refund eligibility check for anyone with a notice on file (30-day rule)
  const noticesWithEligibility = noticesGiven.results.map(n => {
    if (!n.notice_date || !n.planned_vacate_date) return { ...n, eligible: null, notice_days_given: null };
    const days = Math.round((new Date(n.planned_vacate_date) - new Date(n.notice_date)) / 86400000);
    return { ...n, notice_days_given: days, eligible: days >= 30 };
  });

  const todayStr = today;
  const bookingsList = bookingsInPeriod.results.map(b => ({
    ...b,
    is_future: b.join_date > todayStr,
    advance_balance: (b.advance_deposit || 0) - (b.advance_paid || 0),
  }));

  return jsonResponse({
    total_beds: totalBeds.c,
    occupied_beds: occupiedBeds.c,
    reserved_beds: reservedBeds.c,
    vacant_beds: totalBeds.c - occupiedBeds.c - reservedBeds.c,
    sharing_breakdown: sharingTypeBreakdown.results,
    active_residents: activeResidents.c,
    vacating_next_month: vacatingNext.c,
    notices: noticesWithEligibility,
    maintenance_rooms: maintenanceRooms.results,
    this_month: thisMonth,

    // Period-aware (selected date range — Yesterday/Today/7d/1m/3m/Custom)
    period,
    bookings_in_period: bookingsList,
    rent_collected: rentCollectedInPeriod,
    advance_collected: advanceCollectedInPeriod,
    expenses_this_month: expenseTotal,
    expenses_by_category: expenseByCategory,
    net_this_month: rentCollectedInPeriod - expenseTotal,

    // Always "right now" snapshots — pending doesn't belong to a date range
    rent_pending: rentTotalDue - rentTotalPaid,
    advance_pending: advanceTotalDue - advanceTotalCollected,
  });
}
