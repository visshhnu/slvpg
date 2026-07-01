// public/reports.js
// Reports screen — period-based summary reports with print/PDF support.
// Covers: rent collected vs pending, advance status, expenses, net income,
// resident-wise breakdown. Supports Today, Yesterday, 7 Days, This Month,
// 3 Months, and Custom date range.

const REPORT_RANGES = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: '7 Days' },
  { key: 'this_month', label: 'This Month' },
  { key: '3m', label: '3 Months' },
  { key: 'custom', label: 'Custom' },
];

let reportRange = { key: 'this_month', from: null, to: null };
let reportData = null;

async function loadReports() {
  const el = document.getElementById('screen-reports');
  if (!state.currentPgId) {
    el.innerHTML = `<div class="card"><div class="empty-state"><div class="empty-state-title">No PG selected</div></div></div>`;
    return;
  }
  el.innerHTML = renderReportShell();
  await fetchAndRenderReport();
}

function renderReportShell() {
  const today = new Date().toISOString().slice(0, 10);
  return `
    <div class="card" style="margin-bottom:10px;">
      <div class="card-title">Reports</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px;">
        ${REPORT_RANGES.map(r => `
          <button class="btn btn-sm ${reportRange.key === r.key ? 'btn-primary' : 'btn-outline'}"
            style="font-size:11.5px;padding:6px 10px;" onclick="setReportRange('${r.key}')">${r.label}</button>
        `).join('')}
      </div>
      ${reportRange.key === 'custom' ? `
        <div style="display:flex;gap:8px;margin-top:8px;align-items:center;">
          <input type="date" id="report-from" value="${reportRange.from || today}"
            onchange="setReportCustomDate('from', this.value)" style="flex:1;">
          <span style="color:var(--ink-soft);font-size:12px;">to</span>
          <input type="date" id="report-to" value="${reportRange.to || today}"
            onchange="setReportCustomDate('to', this.value)" style="flex:1;">
        </div>
      ` : ''}
    </div>
    <div id="report-body"><div class="card"><div class="empty-state">Loading…</div></div></div>
  `;
}

function setReportRange(key) {
  const today = new Date().toISOString().slice(0, 10);
  if (key === 'custom') {
    reportRange = { key: 'custom', from: reportRange.from || today, to: reportRange.to || today };
  } else {
    reportRange = { key, from: null, to: null };
  }
  loadReports();
}

function setReportCustomDate(which, value) {
  reportRange = { ...reportRange, key: 'custom', [which]: value };
  if (reportRange.from && reportRange.to) fetchAndRenderReport();
}

function buildReportApiPath() {
  let path = `/dashboard?range=${reportRange.key}`;
  if (reportRange.key === 'custom' && reportRange.from && reportRange.to) {
    path += `&from=${reportRange.from}&to=${reportRange.to}`;
  }
  return path;
}

async function fetchAndRenderReport() {
  const el = document.getElementById('report-body');
  if (!el) return;
  el.innerHTML = `<div class="card"><div class="empty-state">Loading…</div></div>`;
  try {
    const [dash, rentData, expData] = await Promise.all([
      api(buildReportApiPath()),
      api(`/rent?month=${new Date().toISOString().slice(0, 7)}`),
      api(`/expenses`),
    ]);
    reportData = { dash, rentData, expData };
    el.innerHTML = renderReportBody(dash, rentData, expData);
  } catch (e) {
    el.innerHTML = `<div class="card"><div class="empty-state-title">Error loading report</div><div>${e.message}</div></div>`;
  }
}

function renderReportBody(d, rentData, expData) {
  const period = d.period || { label: 'This Month' };
  const advancePending = d.advance_pending || 0;
  const advanceCollected = d.advance_collected || 0;

  // Resident breakdown from rent tab rows
  const rows = rentData.rows || [];
  const billed = rows.filter(r => r.id);
  const notDue = rows.filter(r => !r.id);

  // Expenses for this period
  const expRows = (expData.rows || []).filter(e => {
    const from = d.period?.from || new Date().toISOString().slice(0, 8) + '01';
    const to = d.period?.to || new Date().toISOString().slice(0, 10);
    return e.expense_date >= from && e.expense_date <= to;
  });

  return `
    <!-- Summary cards -->
    <div class="card" style="margin-bottom:10px;">
      <div class="card-title">Summary — ${escapeHtml(period.label)}</div>

      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--ink-soft);margin:8px 0 4px;">Rent</div>
      <div class="stat-grid">
        <div class="stat-box"><div class="stat-num green">${fmtMoney(d.rent_collected)}</div><div class="stat-label">Collected</div></div>
        <div class="stat-box"><div class="stat-num red">${fmtMoney(d.rent_pending)}</div><div class="stat-label">Pending now</div></div>
      </div>

      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--ink-soft);margin:12px 0 4px;">Advance Deposits</div>
      <div class="stat-grid">
        <div class="stat-box"><div class="stat-num green">${fmtMoney(advanceCollected)}</div><div class="stat-label">Collected</div></div>
        <div class="stat-box"><div class="stat-num red">${fmtMoney(advancePending)}</div><div class="stat-label">Pending now</div></div>
      </div>

      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--ink-soft);margin:12px 0 4px;">Expenses</div>
      <div class="stat-grid">
        <div class="stat-box"><div class="stat-num">${fmtMoney(d.expenses_this_month)}</div><div class="stat-label">Total expenses</div></div>
        <div class="stat-box"><div class="stat-num ${d.net_this_month >= 0 ? 'green' : 'red'}">${fmtMoney(d.net_this_month)}</div><div class="stat-label">Net (rent − expenses)</div></div>
      </div>
    </div>

    <!-- Rent per resident -->
    <div class="card" style="margin-bottom:10px;">
      <div class="card-title">Rent — Per Resident (${rentData.summary?.month || ''})</div>
      ${billed.length === 0 ? `<div class="empty-state">No billed residents this month.</div>` :
        billed.map(r => `
          <div class="list-row" style="padding:8px 0;border-bottom:1px solid var(--border);">
            <div class="list-row-main">
              <div class="list-row-title">${escapeHtml(r.resident_name)}</div>
              <div class="list-row-sub">${r.floor || ''} ${r.room_number || ''}${r.bed_label ? '-' + r.bed_label : ''} · Joined ${fmtDate(r.join_date)}</div>
              <div style="margin-top:3px;">
                <span class="badge ${rentStatusBadgeClass(r.status)}">${rentStatusLabel(r.status)}</span>
              </div>
            </div>
            <div style="text-align:right;font-size:12.5px;">
              <div style="color:var(--green);font-weight:600;">${fmtMoney(r.amount_paid)} paid</div>
              ${r.amount_paid < r.amount_due ? `<div style="color:var(--red);">${fmtMoney(r.amount_due - r.amount_paid)} due</div>` : ''}
              <div style="color:var(--ink-soft);font-size:10.5px;">of ${fmtMoney(r.amount_due)}</div>
            </div>
          </div>
        `).join('')
      }
      ${notDue.length > 0 ? `
        <div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--border);">
          <div style="font-size:11px;color:var(--ink-soft);margin-bottom:6px;">Future joiners — advance only, no rent due yet</div>
          ${notDue.map(r => `
            <div class="list-row" style="padding:6px 0;">
              <div class="list-row-main">
                <div class="list-row-title">${escapeHtml(r.resident_name)}</div>
                <div class="list-row-sub">Joins ${fmtDate(r.join_date)}</div>
              </div>
              <div style="text-align:right;font-size:12px;">
                <div style="color:var(--green);">Adv ${fmtMoney(r.advance_paid || 0)}</div>
                ${(r.advance_deposit - r.advance_paid) > 0 ? `<div style="color:var(--red);">₹${fmtMoney(r.advance_deposit - r.advance_paid)} pending</div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>

    <!-- Expenses breakdown -->
    ${expRows.length > 0 ? `
      <div class="card" style="margin-bottom:10px;">
        <div class="card-title">Expenses — ${escapeHtml(period.label)}</div>
        ${Object.entries(
          expRows.reduce((acc, e) => { acc[e.category] = (acc[e.category] || 0) + e.amount; return acc; }, {})
        ).map(([cat, total]) => `
          <div class="list-row">
            <div class="list-row-main"><div class="list-row-title">${escapeHtml(cat)}</div></div>
            <div style="font-weight:600;">${fmtMoney(total)}</div>
          </div>
        `).join('')}
        <div class="list-row" style="border-top:1px solid var(--border);padding-top:8px;margin-top:4px;">
          <div class="list-row-main"><div class="list-row-title" style="font-weight:700;">Total</div></div>
          <div style="font-weight:700;">${fmtMoney(expRows.reduce((s, e) => s + e.amount, 0))}</div>
        </div>
      </div>
    ` : ''}

    <!-- Print button -->
    <button class="btn btn-primary" style="width:100%;margin-bottom:20px;" onclick="printReport()">
      Print / Save as PDF
    </button>
  `;
}

function printReport() {
  if (!reportData) return;
  const { dash, rentData, expData } = reportData;
  const period = dash.period || { label: 'This Month', from: '', to: '' };
  const pgName = document.getElementById('pg-name-label')?.textContent || 'SLV PG';
  const rows = rentData.rows || [];
  const billed = rows.filter(r => r.id);
  const notDue = rows.filter(r => !r.id);

  const expRows = (expData.rows || []).filter(e => {
    const from = period.from || new Date().toISOString().slice(0, 8) + '01';
    const to = period.to || new Date().toISOString().slice(0, 10);
    return e.expense_date >= from && e.expense_date <= to;
  });

  const expByCategory = expRows.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount; return acc;
  }, {});

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head>
    <meta charset="UTF-8">
    <title>Report — ${pgName} — ${period.label}</title>
    <style>
      body { font-family: 'Times New Roman', serif; margin: 20px 30px; color: #111; font-size: 12pt; }
      h1 { font-size: 16pt; margin: 0 0 2px; }
      h2 { font-size: 13pt; margin: 18px 0 6px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
      h3 { font-size: 11pt; margin: 12px 0 4px; color: #555; text-transform: uppercase; letter-spacing: .5px; }
      .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #0F2A4A; padding-bottom: 10px; }
      .sub { color: #555; font-size: 10pt; }
      table { width: 100%; border-collapse: collapse; margin-top: 6px; }
      th { background: #0F2A4A; color: white; padding: 6px 8px; text-align: left; font-size: 10pt; }
      td { padding: 5px 8px; border-bottom: 1px solid #eee; font-size: 10pt; }
      tr:nth-child(even) td { background: #f9f6f0; }
      .total-row td { font-weight: bold; border-top: 2px solid #0F2A4A; background: #f0ebe0 !important; }
      .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 10px 0; }
      .summary-box { border: 1px solid #ddd; border-radius: 6px; padding: 10px; text-align: center; }
      .summary-box .num { font-size: 15pt; font-weight: bold; }
      .summary-box .lbl { font-size: 9pt; color: #666; margin-top: 2px; }
      .green { color: #2F7A4F; }
      .red { color: #B23B3B; }
      @media print { button { display: none; } }
    </style>
  </head><body>
    <div class="header">
      <h1>${escapeHtml(pgName)}</h1>
      <div class="sub">Management Report · ${escapeHtml(period.label)}</div>
      <div class="sub">Generated ${new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })} by ${escapeHtml(state.staff?.name || 'Staff')}</div>
    </div>

    <h2>Summary</h2>
    <div class="summary-grid">
      <div class="summary-box"><div class="num green">${fmtMoney(dash.rent_collected)}</div><div class="lbl">Rent Collected</div></div>
      <div class="summary-box"><div class="num red">${fmtMoney(dash.rent_pending)}</div><div class="lbl">Rent Pending</div></div>
      <div class="summary-box"><div class="num">${fmtMoney(dash.expenses_this_month)}</div><div class="lbl">Total Expenses</div></div>
      <div class="summary-box"><div class="num green">${fmtMoney(dash.advance_collected)}</div><div class="lbl">Advance Collected</div></div>
      <div class="summary-box"><div class="num red">${fmtMoney(dash.advance_pending)}</div><div class="lbl">Advance Pending</div></div>
      <div class="summary-box"><div class="num ${dash.net_this_month >= 0 ? 'green' : 'red'}">${fmtMoney(dash.net_this_month)}</div><div class="lbl">Net Income</div></div>
    </div>

    <h2>Rent — ${rentData.summary?.month || ''}</h2>
    <table>
      <tr><th>Name</th><th>Room</th><th>Joined</th><th>Rent Due</th><th>Paid</th><th>Balance</th><th>Status</th></tr>
      ${billed.map(r => `
        <tr>
          <td>${escapeHtml(r.resident_name)}</td>
          <td>${r.floor || ''} ${r.room_number || ''}${r.bed_label ? '-' + r.bed_label : ''}</td>
          <td>${fmtDate(r.join_date)}</td>
          <td>${fmtMoney(r.amount_due)}</td>
          <td style="color:#2F7A4F;font-weight:500;">${fmtMoney(r.amount_paid)}</td>
          <td style="color:${r.amount_due - r.amount_paid > 0 ? '#B23B3B' : '#2F7A4F'};">${fmtMoney(r.amount_due - r.amount_paid)}</td>
          <td>${r.status}</td>
        </tr>
      `).join('')}
      <tr class="total-row">
        <td colspan="3">TOTAL</td>
        <td>${fmtMoney(rentData.summary?.total_due || 0)}</td>
        <td>${fmtMoney(rentData.summary?.total_paid || 0)}</td>
        <td>${fmtMoney(rentData.summary?.total_pending || 0)}</td>
        <td></td>
      </tr>
    </table>

    ${notDue.length > 0 ? `
      <h3>Future Move-ins (Advance Only)</h3>
      <table>
        <tr><th>Name</th><th>Room</th><th>Joins</th><th>Advance Expected</th><th>Advance Paid</th><th>Balance</th></tr>
        ${notDue.map(r => `
          <tr>
            <td>${escapeHtml(r.resident_name)}</td>
            <td>${r.floor || ''} ${r.room_number || ''}${r.bed_label ? '-' + r.bed_label : ''}</td>
            <td>${fmtDate(r.join_date)}</td>
            <td>${fmtMoney(r.advance_deposit || 0)}</td>
            <td>${fmtMoney(r.advance_paid || 0)}</td>
            <td>${fmtMoney((r.advance_deposit || 0) - (r.advance_paid || 0))}</td>
          </tr>
        `).join('')}
      </table>
    ` : ''}

    ${Object.keys(expByCategory).length > 0 ? `
      <h2>Expenses — ${escapeHtml(period.label)}</h2>
      <table>
        <tr><th>Category</th><th>Amount</th></tr>
        ${Object.entries(expByCategory).map(([cat, amt]) => `
          <tr><td>${escapeHtml(cat)}</td><td>${fmtMoney(amt)}</td></tr>
        `).join('')}
        <tr class="total-row"><td>TOTAL</td><td>${fmtMoney(Object.values(expByCategory).reduce((s, v) => s + v, 0))}</td></tr>
      </table>
    ` : ''}

    <br>
    <div style="font-size:9pt;color:#888;text-align:center;margin-top:20px;">
      ${escapeHtml(pgName)} · Ashraya Layout, Garudacharapalya, Mahadevapura, Bangalore – 560048
    </div>
    <script>window.onload = () => window.print();<\/script>
  </body></html>`);
  win.document.close();
}
