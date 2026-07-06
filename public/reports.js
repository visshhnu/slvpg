// public/reports.js
// Reports — landing menu with separate report types, each with its own
// period selector and targeted data fetch.

// ─────────────────────────────────────────
// State
// ─────────────────────────────────────────
let activeReport = null; // null = show landing menu
let reportPeriod = { key: 'this_month', from: null, to: null };

const REPORT_PERIODS = [
  { key: 'today',      label: 'Today' },
  { key: 'yesterday',  label: 'Yesterday' },
  { key: '7d',         label: '7 Days' },
  { key: 'this_month', label: 'This Month' },
  { key: '3m',         label: '3 Months' },
  { key: 'custom',     label: 'Custom' },
];

const REPORT_TYPES = [
  { key: 'rent',       icon: '₹', title: 'Rent Collection',     desc: 'Who paid, who is pending, balance per resident' },
  { key: 'advance',    icon: '🔒', title: 'Advance Deposits',    desc: 'Booking advance paid and pending per resident' },
  { key: 'payments',   icon: '📋', title: 'Payment History',     desc: 'All transactions received in the selected period' },
  { key: 'expenses',   icon: '💸', title: 'Expenses',            desc: 'All outgoing expenses by category' },
  { key: 'residents',  icon: '👥', title: 'Resident List',       desc: 'Active residents, rooms, join dates, rent amounts' },
  { key: 'occupancy',  icon: '🏠', title: 'Occupancy',           desc: 'Room and bed status — occupied, reserved, vacant' },
  { key: 'summary',    icon: '📊', title: 'Monthly Summary',     desc: 'Full income vs expenses overview for the period' },
];

// ─────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────
async function loadReports() {
  activeReport = null;
  renderReportsLanding();
}

function renderReportsLanding() {
  const el = document.getElementById('screen-reports');
  el.innerHTML = `
    <div class="card" style="margin-bottom:12px;">
      <div class="card-title">Reports</div>
      <p style="font-size:12.5px;color:var(--ink-soft);margin:0;">Select a report type to view and print.</p>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px;">
      ${REPORT_TYPES.map(r => `
        <button onclick="openReport('${r.key}')" style="
          background:var(--card);border:1.5px solid var(--border);border-radius:12px;
          padding:14px;text-align:left;cursor:pointer;display:flex;align-items:center;gap:14px;">
          <div style="font-size:22px;width:36px;text-align:center;">${r.icon}</div>
          <div>
            <div style="font-weight:700;font-size:14px;color:var(--navy);">${r.title}</div>
            <div style="font-size:11.5px;color:var(--ink-soft);margin-top:2px;">${r.desc}</div>
          </div>
        </button>
      `).join('')}
    </div>
  `;
}

// ─────────────────────────────────────────
// Open a specific report
// ─────────────────────────────────────────
function openReport(key) {
  activeReport = key;
  reportPeriod = { key: 'this_month', from: null, to: null };
  renderReportScreen(key);
}

// These three are point-in-time snapshots (current advance balances, who's
// active right now, current bed occupancy) -- there's no "period" for them
// to be scoped to, so the period selector is hidden rather than shown next
// to a report where clicking it visibly changes nothing.
const PERIOD_AGNOSTIC_REPORTS = ['advance', 'residents', 'occupancy'];

function renderReportScreen(key) {
  const type = REPORT_TYPES.find(r => r.key === key);
  const el = document.getElementById('screen-reports');
  const today = new Date().toISOString().slice(0, 10);
  const isPeriodAgnostic = PERIOD_AGNOSTIC_REPORTS.includes(key);

  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
      <button onclick="loadReports()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--navy);">←</button>
      <div>
        <div style="font-weight:700;font-size:15px;">${type.icon} ${type.title}</div>
        <div style="font-size:11px;color:var(--ink-soft);">${type.desc}</div>
      </div>
    </div>

    ${isPeriodAgnostic ? `
      <div class="card" style="margin-bottom:10px;">
        <span class="badge badge-gray">Current snapshot — not period-based</span>
      </div>
    ` : `
      <div class="card" style="margin-bottom:10px;">
        <div class="chip-row">
          ${REPORT_PERIODS.map(p => `
            <button class="chip ${reportPeriod.key === p.key ? 'active' : ''}" onclick="changeReportPeriod('${p.key}')">${p.label}</button>
          `).join('')}
        </div>
        <div id="report-custom-dates" style="display:${reportPeriod.key === 'custom' ? 'flex' : 'none'};gap:8px;margin-top:8px;align-items:center;">
          <input type="date" id="report-from" value="${today}" onchange="updateCustomDate('from',this.value)" style="flex:1;">
          <span style="color:var(--ink-soft);font-size:12px;">to</span>
          <input type="date" id="report-to" value="${today}" onchange="updateCustomDate('to',this.value)" style="flex:1;">
        </div>
      </div>
    `}

    <div id="report-content">
      <div class="card"><div class="empty-state">Loading…</div></div>
    </div>
  `;
  fetchReport(key);
}

function changeReportPeriod(key) {
  const today = new Date().toISOString().slice(0, 10);
  reportPeriod = key === 'custom'
    ? { key: 'custom', from: reportPeriod.from || today, to: reportPeriod.to || today }
    : { key, from: null, to: null };
  renderReportScreen(activeReport);
}

function updateCustomDate(which, value) {
  reportPeriod = { ...reportPeriod, key: 'custom', [which]: value };
  if (reportPeriod.from && reportPeriod.to) fetchReport(activeReport);
}

// ─────────────────────────────────────────
// Resolve period → date range
// ─────────────────────────────────────────
// Exact rule for each preset (this is the single source of truth -- the
// labels below must never claim anything this function doesn't actually do):
//   Today       -- single day, today.
//   Yesterday   -- single day, the day before today.
//   7 Days      -- rolling window: today minus 6 days, through today (7 days inclusive).
//   This Month  -- calendar period: the 1st of the current calendar month, through today.
//   3 Months    -- rolling window: today minus 3 calendar months (via JS setMonth),
//                  through today. This is NOT "previous 3 full calendar months" --
//                  e.g. from 6 Jul it's 6 Apr to 6 Jul, not Apr 1 - Jun 30.
//   Custom      -- exactly the two dates picked, inclusive.
function resolvePeriodDates() {
  const today = new Date().toISOString().slice(0, 10);
  const key = reportPeriod.key;
  if (key === 'custom') return { from: reportPeriod.from || today, to: reportPeriod.to || today };
  if (key === 'today') return { from: today, to: today };
  if (key === 'yesterday') {
    const y = new Date(); y.setDate(y.getDate() - 1);
    const ys = y.toISOString().slice(0, 10);
    return { from: ys, to: ys };
  }
  if (key === '7d') {
    const f = new Date(); f.setDate(f.getDate() - 6);
    return { from: f.toISOString().slice(0, 10), to: today };
  }
  if (key === '3m') {
    const f = new Date(); f.setMonth(f.getMonth() - 3);
    return { from: f.toISOString().slice(0, 10), to: today };
  }
  // this_month default
  return { from: today.slice(0, 7) + '-01', to: today };
}

// Every report's card-title and empty-state routes through this, so the
// exact resolved date range is always visible next to whatever number is
// shown -- never just a preset name on its own with the actual dates left
// implicit.
function periodLabel() {
  const p = REPORT_PERIODS.find(p => p.key === reportPeriod.key);
  const { from, to } = resolvePeriodDates();
  const name = reportPeriod.key === 'custom' ? 'Custom' : (p?.label || 'This Month');
  return from === to ? `${name} (${fmtDate(from)})` : `${name} (${fmtDate(from)} – ${fmtDate(to)})`;
}

// ─────────────────────────────────────────
// Fetch and render the right report
// ─────────────────────────────────────────
async function fetchReport(key) {
  const el = document.getElementById('report-content');
  if (!el) return;
  el.innerHTML = `<div class="card"><div class="empty-state">Loading…</div></div>`;
  try {
    const { from, to } = resolvePeriodDates();
    const month = from.slice(0, 7); // dominant month in range

    switch (key) {
      case 'rent':      await renderRentReport(el, month, from, to); break;
      case 'advance':   await renderAdvanceReport(el); break;
      case 'payments':  await renderPaymentsReport(el, from, to); break;
      case 'expenses':  await renderExpensesReport(el, month, from, to); break;
      case 'residents': await renderResidentsReport(el); break;
      case 'occupancy': await renderOccupancyReport(el); break;
      case 'summary':   await renderSummaryReport(el, from, to); break;
    }
  } catch (e) {
    el.innerHTML = `<div class="card"><div class="empty-state-title">Error</div><div>${e.message}</div></div>`;
  }
}

// ─────────────────────────────────────────
// 1. RENT COLLECTION
// ─────────────────────────────────────────
async function renderRentReport(el, month, from, to) {
  const data = await api(`/rent?month=${month}`);
  const rows = data.rows || [];
  const billed = rows.filter(r => r.id);
  const notDue = rows.filter(r => !r.id);
  const s = data.summary;

  // "Collected" here used to just be the current calendar month's ledger
  // total, completely ignoring whatever period was selected -- picking
  // Today/7 Days/3 Months changed nothing. This figure is now genuinely
  // scoped to the selected period, sourced from actual rent payments dated
  // within it. The status list below stays a "right now" snapshot for
  // this calendar month, since "who's currently overdue" isn't something
  // a past date range can answer -- it's clearly labelled as such so the
  // two don't get confused with each other.
  const periodPayments = (await api(`/payments?from=${from}&to=${to}`)).filter(p => p.payment_type === 'rent');
  const collectedInPeriod = periodPayments.reduce((s, p) => s + p.amount, 0);

  el.innerHTML = `
    <div class="card" style="margin-bottom:8px;">
      <div class="card-title">Rent collected — ${periodLabel()}</div>
      <div class="stat-grid">
        <div class="stat-box"><div class="stat-num green">${fmtMoney(collectedInPeriod)}</div><div class="stat-label">Collected in period</div></div>
        <div class="stat-box"><div class="stat-num">${periodPayments.length}</div><div class="stat-label">Rent transactions</div></div>
      </div>
    </div>

    <div class="card" style="margin-bottom:8px;">
      <div class="card-title" style="font-size:11px;text-transform:uppercase;color:var(--ink-soft);">Current status — ${monthLabel(month)}</div>
      <div class="stat-grid">
        <div class="stat-box"><div class="stat-num green">${fmtMoney(s.total_paid)}</div><div class="stat-label">Paid this month</div></div>
        <div class="stat-box"><div class="stat-num red">${fmtMoney(s.total_pending)}</div><div class="stat-label">Pending this month</div></div>
        <div class="stat-box"><div class="stat-num">${fmtMoney(s.total_due)}</div><div class="stat-label">Total billed</div></div>
        <div class="stat-box"><div class="stat-num red">${s.overdue_count}</div><div class="stat-label">Overdue</div></div>
      </div>
    </div>

    ${billed.map(r => `
      <div class="card" style="margin-bottom:6px;padding:10px 12px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <div style="font-weight:600;font-size:13.5px;">${escapeHtml(r.resident_name)}</div>
            <div style="font-size:11px;color:var(--ink-soft);">${r.floor || ''} ${r.room_number || ''}${r.bed_label ? '-'+r.bed_label : ''} · Joined ${fmtDate(r.join_date)}</div>
            <span class="badge ${rentStatusBadgeClass(r.status)} " style="margin-top:4px;">${rentStatusLabel(r.status)}</span>
          </div>
          <div style="text-align:right;">
            <div style="font-weight:700;font-size:13px;color:${r.amount_paid>0?'var(--green)':'var(--ink-soft)'};">${fmtMoney(r.amount_paid)} paid</div>
            ${r.amount_paid < r.amount_due ? `<div style="font-size:11.5px;color:var(--red);">${fmtMoney(r.amount_due - r.amount_paid)} due</div>` : ''}
            <div style="font-size:10.5px;color:var(--ink-soft);">rent: ${fmtMoney(r.amount_due)}</div>
          </div>
        </div>
      </div>
    `).join('')}

    ${notDue.length > 0 ? `
      <div class="card" style="margin-top:8px;">
        <div class="card-title" style="font-size:11px;text-transform:uppercase;color:var(--ink-soft);">No rent due yet — future move-ins</div>
        ${notDue.map(r => `
          <div class="list-row">
            <div class="list-row-main">
              <div class="list-row-title">${escapeHtml(r.resident_name)}</div>
              <div class="list-row-sub">Joins ${fmtDate(r.join_date)}</div>
            </div>
            <span class="badge badge-gold">Not yet billed</span>
          </div>
        `).join('')}
      </div>
    ` : ''}

    <button class="btn btn-primary" style="width:100%;margin-top:12px;" onclick="printRentReport('${month}')">Print / Save as PDF</button>
  `;
}

// ─────────────────────────────────────────
// 2. ADVANCE DEPOSITS
// ─────────────────────────────────────────
async function renderAdvanceReport(el) {
  const res = await api('/residents');
  const active = (res.residents || res).filter(r => r.status !== 'vacated');
  const totalExp = active.reduce((s, r) => s + (r.advance_deposit || 0), 0);
  const totalPaid = active.reduce((s, r) => s + (r.advance_paid || 0), 0);

  el.innerHTML = `
    <div class="card" style="margin-bottom:8px;">
      <div class="card-title">Advance Deposits — All Active Residents</div>
      <div class="stat-grid">
        <div class="stat-box"><div class="stat-num green">${fmtMoney(totalPaid)}</div><div class="stat-label">Total collected</div></div>
        <div class="stat-box"><div class="stat-num red">${fmtMoney(totalExp - totalPaid)}</div><div class="stat-label">Total pending</div></div>
        <div class="stat-box"><div class="stat-num">${fmtMoney(totalExp)}</div><div class="stat-label">Total expected</div></div>
        <div class="stat-box"><div class="stat-num">${active.length}</div><div class="stat-label">Active residents</div></div>
      </div>
    </div>

    ${active.sort((a,b) => (b.advance_deposit - b.advance_paid) - (a.advance_deposit - a.advance_paid)).map(r => {
      const bal = (r.advance_deposit || 0) - (r.advance_paid || 0);
      return `
        <div class="card" style="margin-bottom:6px;padding:10px 12px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;">
            <div>
              <div style="font-weight:600;font-size:13.5px;">${escapeHtml(r.name)}</div>
              <div style="font-size:11px;color:var(--ink-soft);">${r.floor || ''} ${r.room_number || ''}${r.bed_label ? '-'+r.bed_label : ''} · ${r.join_date > new Date().toISOString().slice(0,10) ? 'Joins '+fmtDate(r.join_date) : 'Joined '+fmtDate(r.join_date)}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:13px;font-weight:700;color:${bal>0?'var(--red)':'var(--green)'};">
                ${bal > 0 ? fmtMoney(bal)+' pending' : 'Paid ✓'}
              </div>
              <div style="font-size:10.5px;color:var(--ink-soft);">${fmtMoney(r.advance_paid||0)} of ${fmtMoney(r.advance_deposit||0)}</div>
            </div>
          </div>
        </div>
      `;
    }).join('')}

    <button class="btn btn-primary" style="width:100%;margin-top:12px;" onclick="printGenericReport()">Print / Save as PDF</button>
  `;
}

// ─────────────────────────────────────────
// 3. PAYMENT HISTORY
// ─────────────────────────────────────────
async function renderPaymentsReport(el, from, to) {
  // /payments now genuinely filters by date range server-side (it used to
  // silently ignore from/to), and this returns every payment type --
  // rent, advance, refund -- across the whole range regardless of how many
  // calendar months it spans. The old version derived this list from a
  // single month's rent_ledger rows, which meant "3 Months" or a custom
  // range never actually saw more than one month, and advance payments
  // (never tied to a rent_ledger row) were silently excluded entirely.
  const payments = await api(`/payments?from=${from}&to=${to}`);
  const total = payments.reduce((s, p) => s + p.amount, 0);

  el.innerHTML = `
    <div class="card" style="margin-bottom:8px;">
      <div class="card-title">Payments — ${periodLabel()}</div>
      <div class="stat-grid">
        <div class="stat-box"><div class="stat-num green">${fmtMoney(total)}</div><div class="stat-label">Total received</div></div>
        <div class="stat-box"><div class="stat-num">${payments.length}</div><div class="stat-label">Transactions</div></div>
      </div>
    </div>

    ${payments.length === 0
      ? `<div class="card"><div class="empty-state">No payments recorded between ${fmtDate(from)} and ${fmtDate(to)}.</div></div>`
      : payments.map(p => `
        <div class="list-row" style="background:var(--card);border-radius:8px;padding:10px 12px;margin-bottom:6px;border:1px solid var(--border);">
          <div class="list-row-main">
            <div class="list-row-title">${escapeHtml(p.resident_name)}</div>
            <div class="list-row-sub">${p.floor || ''} ${p.room_number || ''} · ${fmtDate(p.payment_date)} · ${p.payment_mode || 'cash'} · by ${escapeHtml(p.collected_by || '—')}</div>
            <span class="badge ${p.payment_type === 'rent' ? 'badge-green' : p.payment_type === 'advance' ? 'badge-amber' : 'badge-gray'}">${p.payment_type}</span>
          </div>
          <div style="font-weight:700;font-size:14px;color:var(--green);">+${fmtMoney(p.amount)}</div>
        </div>
      `).join('')
    }

    <button class="btn btn-primary" style="width:100%;margin-top:12px;" onclick="printGenericReport()">Print / Save as PDF</button>
  `;
}

// ─────────────────────────────────────────
// 4. EXPENSES
// ─────────────────────────────────────────
async function renderExpensesReport(el, month, from, to) {
  // Date-range filter, not a single `month` -- a "3 Months" or custom range
  // spanning multiple calendar months used to only ever fetch the FIRST
  // month (month = from.slice(0,7)) and could never see the rest, no
  // matter how the client-side filter below was written.
  const data = await api(`/expenses?from=${from}&to=${to}`);
  const rows = data.rows || [];
  const byCat = {};
  rows.forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + e.amount; });
  const total = rows.reduce((s, e) => s + e.amount, 0);

  el.innerHTML = `
    <div class="card" style="margin-bottom:8px;">
      <div class="card-title">Expenses — ${periodLabel()}</div>
      <div class="stat-grid">
        <div class="stat-box"><div class="stat-num">${fmtMoney(total)}</div><div class="stat-label">Total</div></div>
        <div class="stat-box"><div class="stat-num">${rows.length}</div><div class="stat-label">Entries</div></div>
      </div>
    </div>

    ${Object.keys(byCat).length > 0 ? `
      <div class="card" style="margin-bottom:8px;">
        <div class="card-title" style="font-size:11px;text-transform:uppercase;color:var(--ink-soft);">By Category</div>
        ${Object.entries(byCat).sort((a,b) => b[1]-a[1]).map(([cat, amt]) => `
          <div class="list-row">
            <div class="list-row-main"><div class="list-row-title">${escapeHtml(cat)}</div></div>
            <div style="font-weight:600;">${fmtMoney(amt)}</div>
          </div>
        `).join('')}
      </div>
    ` : ''}

    ${rows.length === 0
      ? `<div class="card"><div class="empty-state">No expenses recorded between ${fmtDate(from)} and ${fmtDate(to)}.</div></div>`
      : rows.map(e => `
        <div class="list-row" style="background:var(--card);border-radius:8px;padding:10px 12px;margin-bottom:6px;border:1px solid var(--border);">
          <div class="list-row-main">
            <div class="list-row-title">${escapeHtml(e.category)}${e.description ? ' — '+escapeHtml(e.description) : ''}</div>
            <div class="list-row-sub">${fmtDate(e.expense_date)} · ${escapeHtml(e.paid_by || '—')}</div>
          </div>
          <div style="font-weight:700;color:var(--red);">−${fmtMoney(e.amount)}</div>
        </div>
      `).join('')
    }

    <button class="btn btn-primary" style="width:100%;margin-top:12px;" onclick="printGenericReport()">Print / Save as PDF</button>
  `;
}

// ─────────────────────────────────────────
// 5. RESIDENT LIST
// ─────────────────────────────────────────
async function renderResidentsReport(el) {
  const res = await api('/residents?status=active');
  const residents = res.residents || res;

  el.innerHTML = `
    <div class="card" style="margin-bottom:8px;">
      <div class="card-title">Active Residents</div>
      <div class="stat-grid">
        <div class="stat-box"><div class="stat-num">${residents.length}</div><div class="stat-label">Total residents</div></div>
        <div class="stat-box"><div class="stat-num green">${residents.filter(r=>r.has_checkin_receipt).length}</div><div class="stat-label">Checked in</div></div>
      </div>
    </div>

    ${residents.map(r => `
      <div class="card" style="margin-bottom:6px;padding:10px 12px;">
        <div style="display:flex;justify-content:space-between;">
          <div>
            <div style="font-weight:600;font-size:13.5px;">${escapeHtml(r.name)}</div>
            <div style="font-size:11.5px;color:var(--ink-soft);">${r.floor||''} ${r.room_number||''}${r.bed_label?'-'+r.bed_label:''} · ${escapeHtml(r.phone||'')}</div>
            <div style="font-size:11px;color:var(--ink-soft);">Joined ${fmtDate(r.join_date)} · ${escapeHtml(r.occupation||'—')}</div>
          </div>
          <div style="text-align:right;font-size:11.5px;">
            <div style="font-weight:600;">${fmtMoney(r.monthly_rent||0)}/mo</div>
            <div style="color:var(--ink-soft);">Adv ${fmtMoney(r.advance_paid||0)}/${fmtMoney(r.advance_deposit||0)}</div>
          </div>
        </div>
      </div>
    `).join('')}

    <button class="btn btn-primary" style="width:100%;margin-top:12px;" onclick="printGenericReport()">Print / Save as PDF</button>
  `;
}

// ─────────────────────────────────────────
// 6. OCCUPANCY
// ─────────────────────────────────────────
async function renderOccupancyReport(el) {
  const data = await api('/rooms');
  const rooms = data.rooms || data;
  const allBeds = rooms.flatMap(r => r.beds || []);
  const occupied = allBeds.filter(b => b.occupied).length;
  const reserved = allBeds.filter(b => b.reserved).length;
  const vacant = allBeds.filter(b => !b.occupied && !b.reserved).length;
  const floors = [...new Set(rooms.map(r => r.floor))];

  el.innerHTML = `
    <div class="card" style="margin-bottom:8px;">
      <div class="card-title">Occupancy</div>
      <div class="stat-grid">
        <div class="stat-box"><div class="stat-num">${allBeds.length}</div><div class="stat-label">Total beds</div></div>
        <div class="stat-box"><div class="stat-num green">${occupied}</div><div class="stat-label">Occupied</div></div>
        <div class="stat-box"><div class="stat-num gold">${reserved}</div><div class="stat-label">Reserved</div></div>
        <div class="stat-box"><div class="stat-num">${vacant}</div><div class="stat-label">Vacant</div></div>
      </div>
    </div>

    ${floors.map(floor => `
      <div class="card" style="margin-bottom:8px;">
        <div class="card-title" style="font-size:11px;text-transform:uppercase;color:var(--ink-soft);">${floor} Floor</div>
        ${rooms.filter(r => r.floor === floor).map(room => {
          const occ = (room.beds||[]).filter(b => b.occupied).length;
          const res = (room.beds||[]).filter(b => b.reserved).length;
          const cap = room.capacity;
          return `
            <div class="list-row">
              <div class="list-row-main">
                <div class="list-row-title">Room ${escapeHtml(room.room_number)} — ${room.sharing_type}</div>
                <div class="list-row-sub">
                  ${(room.beds||[]).map(b => `${escapeHtml(b.label)}: ${b.occupied?'<strong>Occupied</strong>':b.reserved?'<em>Reserved</em>':'Vacant'}`).join(' · ')}
                </div>
              </div>
              <div style="text-align:right;font-size:12px;">
                <div style="font-weight:600;">${occ}/${cap}</div>
                ${res > 0 ? `<div style="color:var(--gold);font-size:10.5px;">${res} reserved</div>` : ''}
                <div style="font-size:10.5px;color:var(--ink-soft);">${fmtMoney(room.monthly_rent)}/mo</div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `).join('')}

    <button class="btn btn-primary" style="width:100%;margin-top:12px;" onclick="printGenericReport()">Print / Save as PDF</button>
  `;
}

// ─────────────────────────────────────────
// 7. MONTHLY SUMMARY
// ─────────────────────────────────────────
async function renderSummaryReport(el, from, to) {
  const rangeKey = reportPeriod.key;
  const dash = await api(`/dashboard?range=${rangeKey}${rangeKey==='custom'?`&from=${from}&to=${to}`:''}`);

  el.innerHTML = `
    <div class="card" style="margin-bottom:8px;">
      <div class="card-title">Summary — ${periodLabel()}</div>
      <div style="font-size:11px;text-transform:uppercase;color:var(--ink-soft);margin:8px 0 4px;">Occupancy</div>
      <div class="stat-grid">
        <div class="stat-box"><div class="stat-num">${dash.occupied_beds}/${dash.total_beds}</div><div class="stat-label">Beds occupied</div></div>
        <div class="stat-box"><div class="stat-num gold">${dash.reserved_beds||0}</div><div class="stat-label">Reserved</div></div>
        <div class="stat-box"><div class="stat-num">${dash.vacant_beds}</div><div class="stat-label">Vacant</div></div>
        <div class="stat-box"><div class="stat-num">${dash.active_residents}</div><div class="stat-label">Residents</div></div>
      </div>

      <div style="font-size:11px;text-transform:uppercase;color:var(--ink-soft);margin:12px 0 4px;">Rent</div>
      <div class="stat-grid">
        <div class="stat-box"><div class="stat-num green">${fmtMoney(dash.rent_collected)}</div><div class="stat-label">Collected</div></div>
        <div class="stat-box"><div class="stat-num red">${fmtMoney(dash.rent_pending)}</div><div class="stat-label">Pending</div></div>
      </div>

      <div style="font-size:11px;text-transform:uppercase;color:var(--ink-soft);margin:12px 0 4px;">Advance</div>
      <div class="stat-grid">
        <div class="stat-box"><div class="stat-num green">${fmtMoney(dash.advance_collected)}</div><div class="stat-label">Collected</div></div>
        <div class="stat-box"><div class="stat-num red">${fmtMoney(dash.advance_pending)}</div><div class="stat-label">Pending</div></div>
      </div>

      <div style="font-size:11px;text-transform:uppercase;color:var(--ink-soft);margin:12px 0 4px;">Money</div>
      <div class="stat-grid">
        <div class="stat-box"><div class="stat-num">${fmtMoney(dash.expenses_this_month)}</div><div class="stat-label">Expenses</div></div>
        <div class="stat-box"><div class="stat-num ${dash.net_this_month>=0?'green':'red'}">${fmtMoney(dash.net_this_month)}</div><div class="stat-label">Net income</div></div>
      </div>

      ${Object.keys(dash.expenses_by_category||{}).length > 0 ? `
        <div style="font-size:11px;text-transform:uppercase;color:var(--ink-soft);margin:12px 0 4px;">Expenses by category</div>
        ${Object.entries(dash.expenses_by_category).map(([cat, amt]) => `
          <div class="list-row" style="padding:4px 0;">
            <div class="list-row-main"><div style="font-size:12.5px;">${escapeHtml(cat)}</div></div>
            <div style="font-weight:600;">${fmtMoney(amt)}</div>
          </div>
        `).join('')}
      ` : ''}
    </div>

    <button class="btn btn-primary" style="width:100%;margin-top:4px;" onclick="printGenericReport()">Print / Save as PDF</button>
  `;
}

// ─────────────────────────────────────────
// Print helpers
// ─────────────────────────────────────────
function printGenericReport() {
  const type = REPORT_TYPES.find(r => r.key === activeReport);
  const pgName = document.getElementById('pg-name-label')?.textContent || 'SLV PG';
  const content = document.getElementById('report-content')?.innerHTML || '';
  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head>
    <meta charset="UTF-8">
    <title>${type?.title} — ${pgName}</title>
    <style>
      body{font-family:sans-serif;margin:20px 30px;color:#111;font-size:12pt;}
      .card{border:1px solid #ddd;border-radius:8px;padding:12px;margin-bottom:10px;}
      .card-title{font-weight:700;font-size:13pt;margin-bottom:8px;}
      .stat-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:8px 0;}
      .stat-box{border:1px solid #eee;border-radius:6px;padding:8px;text-align:center;}
      .stat-num{font-size:14pt;font-weight:700;}
      .stat-label{font-size:9pt;color:#666;}
      .green{color:#2F7A4F;} .red{color:#B23B3B;} .gold{color:#C99A3E;}
      .list-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f0f0f0;}
      .list-row-title{font-weight:600;font-size:11pt;}
      .list-row-sub{font-size:9.5pt;color:#666;}
      .badge{display:inline-block;font-size:9pt;padding:2px 7px;border-radius:10px;background:#eee;}
      button{display:none;}
      h2{text-align:center;color:#0F2A4A;}
      .sub{text-align:center;font-size:10pt;color:#555;margin-bottom:16px;}
    </style>
  </head><body>
    <h2>${pgName}</h2>
    <div class="sub">${type?.title} · ${periodLabel()} · Generated ${new Date().toLocaleDateString('en-IN')}</div>
    ${content}
    <script>window.onload=()=>window.print();<\/script>
  </body></html>`);
  win.document.close();
}

async function printRentReport(month) {
  printGenericReport();
}
