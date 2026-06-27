// ===== Dashboard screen =====

async function loadDashboard() {
  const el = document.getElementById('screen-dashboard');
  el.innerHTML = `<div class="card"><div class="empty-state">Loading…</div></div>`;
  try {
    const d = await api('/dashboard');
    renderDashboard(d);
  } catch (e) {
    el.innerHTML = `<div class="card"><div class="empty-state-title">Couldn't load dashboard</div><div>${e.message}</div></div>`;
  }
}

function renderDashboard(d) {
  const el = document.getElementById('screen-dashboard');
  const occPct = d.total_beds ? Math.round((d.occupied_beds / d.total_beds) * 100) : 0;

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
          <div class="stat-label">Expenses paid out</div>
        </div>
        <div class="stat-box">
          <div class="stat-num ${d.net_this_month >= 0 ? 'green' : 'red'}">${fmtMoney(d.net_this_month)}</div>
          <div class="stat-label">Net this month</div>
        </div>
      </div>
    </div>

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
          <span class="badge badge-amber">Leaves ${fmtDate(n.planned_vacate_date)}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
