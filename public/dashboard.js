// ===== Dashboard screen =====

const DASHBOARD_RANGES = [
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 Days' },
  { key: '1m', label: '1 Month' },
  { key: '3m', label: '3 Months' },
  { key: 'custom', label: 'Custom' },
];

let dashboardRange = { key: 'this_month', from: null, to: null };

async function loadDashboard() {
  const el = document.getElementById('screen-dashboard');
  el.innerHTML = `<div class="card"><div class="empty-state">Loading…</div></div>`;
  if (!state.currentPgId) {
    el.innerHTML = `<div class="card"><div class="empty-state"><div class="empty-state-title">No PG set up yet</div><div>Tap the property name at the top to add your first PG.</div></div></div>`;
    return;
  }
  try {
    let dashPath = '/dashboard';
    if (dashboardRange.key !== 'this_month') {
      dashPath += `?range=${dashboardRange.key}`;
      if (dashboardRange.key === 'custom' && dashboardRange.from && dashboardRange.to) {
        dashPath += `&from=${dashboardRange.from}&to=${dashboardRange.to}`;
      }
    }
    const [d, enquiries] = await Promise.all([
      api(dashPath),
      api('/enquiries?status=new').catch(() => []),
    ]);
    renderDashboard(d, enquiries);
  } catch (e) {
    el.innerHTML = `<div class="card"><div class="empty-state-title">Couldn't load dashboard</div><div>${e.message}</div></div>`;
  }
}

function setDashboardRange(key) {
  if (key === 'custom') {
    const today = new Date().toISOString().slice(0, 10);
    dashboardRange = { key: 'custom', from: dashboardRange.from || today, to: dashboardRange.to || today };
  } else {
    dashboardRange = { key, from: null, to: null };
  }
  loadDashboard();
}

function setDashboardCustomDate(which, value) {
  dashboardRange = { ...dashboardRange, key: 'custom', [which]: value };
  if (dashboardRange.from && dashboardRange.to) loadDashboard();
}

const CATEGORY_LABELS = {
  groceries: 'Groceries', milk: 'Milk', electricity: 'Electricity', water: 'Water',
  wifi: 'Wi-Fi', landlord_rent: 'Rent to Landlord', salary: 'Staff Salary',
  housekeeping: 'Housekeeping', maintenance: 'Maintenance', repairs: 'Repairs',
  plumbing: 'Plumbing', furniture: 'Furniture', cleaning: 'Cleaning', other: 'Other',
};

function renderDashboard(d, enquiries = []) {
  const el = document.getElementById('screen-dashboard');
  const occPct = d.total_beds ? Math.round((d.occupied_beds / d.total_beds) * 100) : 0;
  const categoryEntries = Object.entries(d.expenses_by_category || {}).sort((a, b) => b[1] - a[1]);

  el.innerHTML = `
    ${enquiries.length > 0 ? `
      <div class="card" style="border-color:var(--gold);margin-bottom:12px;">
        <div class="card-title" style="display:flex;align-items:center;justify-content:space-between;">
          <span style="color:var(--gold);">New Room Enquiries (${enquiries.length})</span>
          <button class="btn btn-sm" onclick="loadAllEnquiries()" style="font-size:11px;">View all</button>
        </div>
        ${enquiries.slice(0,3).map(e => `
          <div class="list-row" style="padding:10px 0;">
            <div class="list-row-main">
              <div class="list-row-title">${escapeHtml(e.name)} · ${escapeHtml(e.phone)}</div>
              <div class="list-row-sub">
                ${e.room_type ? e.room_type + ' sharing' : 'Any'} ·
                ${e.move_in_date ? 'Move-in: ' + fmtDate(e.move_in_date) : 'Date not given'} ·
                ${fmtDate(e.created_at.slice(0,10))}
              </div>
              ${e.message ? `<div class="list-row-sub" style="margin-top:2px;font-style:italic;">"${escapeHtml(e.message.slice(0,60))}${e.message.length>60?'…':''}"</div>` : ''}
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end;">
              <a href="tel:${escapeHtml(e.phone)}" class="btn btn-sm" style="font-size:11px;color:var(--green);">Call</a>
              <a href="https://wa.me/91${e.phone.replace(/\D/g,'')}?text=${encodeURIComponent('Hi ' + e.name + ', thank you for your enquiry at Sri Lakshmi Venkateshwara Luxury Co-Living PG. We have rooms available. When would you like to visit?')}" target="_blank" class="btn btn-sm" style="font-size:11px;">WhatsApp</a>
              <button class="btn btn-sm" style="font-size:11px;" onclick="markEnquiryContacted(${e.id})">Mark contacted</button>
            </div>
          </div>
        `).join('')}
      </div>
    ` : ''}

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
      <div class="card-title">Bookings — ${d.period ? d.period.label : 'This month'} <span style="font-weight:400;color:var(--ink-soft);font-size:11px;">(by join date)</span></div>
      ${(!d.bookings_in_period || d.bookings_in_period.length === 0) ? `
        <div class="empty-state">
          <div class="empty-state-title">No joins in this period</div>
          <div>Tip: pick Custom with a future "to" date to see upcoming bookings too.</div>
        </div>
      ` : d.bookings_in_period.map(b => `
        <div class="list-row">
          <div class="list-row-main">
            <div class="list-row-title">${escapeHtml(b.name)}</div>
            <div class="list-row-sub">${b.floor || ''} ${b.room_number || ''}${b.bed_label ? '-' + b.bed_label : ''} · ${b.is_future ? 'Moves in' : 'Joined'} ${fmtDate(b.join_date)}</div>
          </div>
          <div style="text-align:right;">
            <span class="badge ${b.is_future ? 'badge-gold' : 'badge-green'}">${b.is_future ? 'Upcoming' : 'Joined'}</span>
            ${b.advance_deposit ? `<div style="margin-top:4px;font-size:11px;color:var(--ink-soft);">Advance ${fmtMoney(b.advance_paid || 0)}/${fmtMoney(b.advance_deposit)}${b.advance_balance > 0 ? ' — pending' : ' ✓'}</div>` : ''}
          </div>
        </div>
      `).join('')}
    </div>

    <div class="card">
      <div class="card-title">Money — choose a period</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px;">
        ${DASHBOARD_RANGES.map(r => `
          <button class="btn btn-sm ${dashboardRange.key === r.key ? 'btn-primary' : 'btn-outline'}"
            style="font-size:11.5px;padding:6px 10px;" onclick="setDashboardRange('${r.key}')">${r.label}</button>
        `).join('')}
        <button class="btn btn-sm ${dashboardRange.key === 'this_month' ? 'btn-primary' : 'btn-outline'}"
          style="font-size:11.5px;padding:6px 10px;" onclick="setDashboardRange('this_month')">This Month</button>
      </div>
      ${dashboardRange.key === 'custom' ? `
        <div style="display:flex;gap:8px;margin-top:8px;align-items:center;">
          <input type="date" value="${dashboardRange.from || ''}" onchange="setDashboardCustomDate('from', this.value)" style="flex:1;">
          <span style="color:var(--ink-soft);font-size:12px;">to</span>
          <input type="date" value="${dashboardRange.to || ''}" onchange="setDashboardCustomDate('to', this.value)" style="flex:1;">
        </div>
      ` : ''}
    </div>

    <div class="card">
      <div class="card-title">${d.period ? d.period.label : monthLabel(d.this_month)} Money</div>
      <div class="stat-grid">
        <div class="stat-box">
          <div class="stat-num green">${fmtMoney(d.rent_collected)}</div>
          <div class="stat-label">Rent collected</div>
        </div>
        <div class="stat-box">
          <div class="stat-num red">${fmtMoney(d.rent_pending)}</div>
          <div class="stat-label">Rent pending (now)</div>
        </div>
        <div class="stat-box">
          <div class="stat-num">${fmtMoney(d.expenses_this_month)}</div>
          <div class="stat-label">Total expenses</div>
        </div>
        <div class="stat-box">
          <div class="stat-num ${d.net_this_month >= 0 ? 'green' : 'red'}">${fmtMoney(d.net_this_month)}</div>
          <div class="stat-label">Net (this period)</div>
        </div>
      </div>
      <div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--border);display:flex;justify-content:space-between;font-size:12.5px;color:var(--ink-soft);">
        <div>Total rent collected + pending right now</div>
        <div style="font-weight:700;color:var(--ink);">${fmtMoney(d.rent_collected + d.rent_pending)}</div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Advance Deposits</div>
      <div class="stat-grid">
        <div class="stat-box">
          <div class="stat-num green">${fmtMoney(d.advance_collected)}</div>
          <div class="stat-label">Advance collected (period)</div>
        </div>
        <div class="stat-box">
          <div class="stat-num red">${fmtMoney(d.advance_pending)}</div>
          <div class="stat-label">Advance pending (now)</div>
        </div>
      </div>
      <div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--border);display:flex;justify-content:space-between;font-size:12.5px;color:var(--ink-soft);">
        <div>Total advance collected + pending right now</div>
        <div style="font-weight:700;color:var(--ink);">${fmtMoney(d.advance_collected + d.advance_pending)}</div>
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

async function markEnquiryContacted(id) {
  try {
    await api(`/enquiries/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'contacted' }) });
    showToast('Marked as contacted.', 'success');
    loadDashboard();
  } catch(e) { showToast(e.message, 'error'); }
}

async function loadAllEnquiries() {
  try {
    const all = await api('/enquiries');
    const statusLabel = { new: 'New', contacted: 'Contacted', converted: 'Converted', not_interested: 'Not interested' };
    const statusBadge = { new: 'badge-gold', contacted: 'badge-amber', converted: 'badge-green', not_interested: 'badge-gray' };
    openModal(`
      <div class="modal-header">
        <div class="modal-title">All Room Enquiries</div>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      ${all.length === 0 ? '<div class="empty-state">No enquiries yet.</div>' :
        all.map(e => `
          <div class="list-row" style="padding:10px 0;border-bottom:1px solid var(--border);">
            <div class="list-row-main">
              <div class="list-row-title">${escapeHtml(e.name)} · ${escapeHtml(e.phone)}</div>
              <div class="list-row-sub">${e.room_type||'Any'} · ${e.move_in_date ? fmtDate(e.move_in_date) : '—'} · ${fmtDate(e.created_at.slice(0,10))}</div>
              ${e.message ? `<div class="list-row-sub" style="font-style:italic;">"${escapeHtml(e.message.slice(0,80))}"</div>` : ''}
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end;">
              <span class="badge ${statusBadge[e.status]||'badge-gray'}">${statusLabel[e.status]||e.status}</span>
              <select onchange="updateEnquiryStatus(${e.id}, this.value)" style="font-size:11px;padding:3px 6px;border-radius:6px;border:1px solid var(--border);">
                ${['new','contacted','converted','not_interested'].map(s =>
                  `<option value="${s}" ${e.status===s?'selected':''}>${statusLabel[s]}</option>`
                ).join('')}
              </select>
            </div>
          </div>`).join('')
      }
    `);
  } catch(e) { showToast(e.message, 'error'); }
}

async function updateEnquiryStatus(id, status) {
  try {
    await api(`/enquiries/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    showToast('Status updated.', 'success');
    loadDashboard();
  } catch(e) { showToast(e.message, 'error'); }
}
