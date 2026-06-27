// ===== Dashboard screen =====

async function loadDashboard() {
  const el = document.getElementById('screen-dashboard');
  el.innerHTML = `<div class="card"><div class="empty-state">Loading…</div></div>`;
  if (!state.currentPgId) {
    el.innerHTML = `<div class="card"><div class="empty-state"><div class="empty-state-title">No PG set up yet</div><div>Tap the property name at the top to add your first PG.</div></div></div>`;
    return;
  }
  try {
    const d = await api('/dashboard');
    renderDashboard(d);
  } catch (e) {
    el.innerHTML = `<div class="card"><div class="empty-state-title">Couldn't load dashboard</div><div>${e.message}</div></div>`;
  }
}

const CATEGORY_LABELS = {
  groceries: 'Groceries', milk: 'Milk', electricity: 'Electricity', water: 'Water',
  wifi: 'Wi-Fi', landlord_rent: 'Rent to Landlord', salary: 'Staff Salary',
  housekeeping: 'Housekeeping', maintenance: 'Maintenance', repairs: 'Repairs',
  plumbing: 'Plumbing', furniture: 'Furniture', cleaning: 'Cleaning', other: 'Other',
};

function renderDashboard(d) {
  const el = document.getElementById('screen-dashboard');
  const occPct = d.total_beds ? Math.round((d.occupied_beds / d.total_beds) * 100) : 0;
  const categoryEntries = Object.entries(d.expenses_by_category || {}).sort((a, b) => b[1] - a[1]);

  el.innerHTML = `
    <div class="card">
      <div class="card-title">Occupancy</div>
      <div class="stat-grid">
        <div class="stat-box">
          <div class="stat-num">${d.occupied_beds}/${d.total_beds}</div>
          <div class="stat-label">Beds occupied (${occPct}%)</div>
        </div>
        <div class="stat-box">
          <div class="stat-num gold">${d.vacant_beds}</div>
          <div class="stat-label">Beds available now</div>
        </div>
        <div class="stat-box">
          <div class="stat-num">${d.active_residents}</div>
          <div class="stat-label">Active residents</div>
        </div>
        <div class="stat-box">
          <div class="stat-num ${d.vacating_next_month > 0 ? 'red' : ''}">${d.vacating_next_month}</div>
          <div class="stat-label">Vacating next month</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">${monthLabel(d.this_month)} Money</div>
      <div class="stat-grid">
        <div class="stat-box">
          <div class="stat-num green">${fmtMoney(d.rent_collected)}</div>
          <div class="stat-label">Rent collected</div>
        </div>
        <div class="stat-box">
          <div class="stat-num red">${fmtMoney(d.rent_pending)}</div>
          <div class="stat-label">Rent pending</div>
        </div>
        <div class="stat-box">
          <div class="stat-num">${fmtMoney(d.expenses_this_month)}</div>
          <div class="stat-label">Total expenses</div>
        </div>
        <div class="stat-box">
          <div class="stat-num ${d.net_this_month >= 0 ? 'green' : 'red'}">${fmtMoney(d.net_this_month)}</div>
          <div class="stat-label">Net this month</div>
        </div>
      </div>
      ${categoryEntries.length > 0 ? `
        <div style="margin-top:14px; border-top:1px solid var(--border); padding-top:12px;">
          ${categoryEntries.map(([cat, amt]) => `
            <div class="list-row" style="padding:7px 0;">
              <div class="list-row-main"><div class="list-row-sub">${CATEGORY_LABELS[cat] || cat}</div></div>
              <div style="font-weight:700; font-size:13.5px;">${fmtMoney(amt)}</div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>

    ${d.maintenance_rooms && d.maintenance_rooms.length > 0 ? `
      <div class="card" style="border-color:var(--red);">
        <div class="card-title" style="color:var(--red);">Rooms Needing Maintenance</div>
        ${d.maintenance_rooms.map(r => `
          <div class="list-row">
            <div class="list-row-main">
              <div class="list-row-title">${r.floor} ${escapeHtml(r.room_number)}</div>
              ${r.maintenance_note ? `<div class="list-row-sub">${escapeHtml(r.maintenance_note)}</div>` : ''}
            </div>
            <span class="badge badge-maint">Needs Attention</span>
          </div>
        `).join('')}
      </div>
    ` : ''}

    <div class="card">
      <div class="card-title">Vacating Soon — Priority List</div>
      ${d.notices.length === 0 ? `
        <div class="empty-state">
          <div class="empty-state-title">No one has given notice</div>
          <div>Vacate notices will show up here, sorted by earliest leaving date.</div>
        </div>
      ` : d.notices.map(n => `
        <div class="list-row">
          <div class="list-row-main">
            <div class="list-row-title">${escapeHtml(n.name)}</div>
            <div class="list-row-sub">${n.floor || ''} ${n.room_number || ''}${n.bed_label ? '-' + n.bed_label : ''} · Notified ${fmtDate(n.notice_date)}</div>
          </div>
          <div style="text-align:right;">
            <span class="badge badge-amber">Leaves ${fmtDate(n.planned_vacate_date)}</span>
            ${n.eligible !== null ? `<div style="margin-top:4px;"><span class="badge ${n.eligible ? 'badge-green' : 'badge-red'}">${n.eligible ? 'Refund eligible' : 'No refund (< 30 days notice)'}</span></div>` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}
