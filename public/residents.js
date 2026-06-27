// ===== Residents screen =====

let residentFilter = 'active';

async function loadResidents() {
  const el = document.getElementById('screen-residents');
  el.innerHTML = `<div class="card"><div class="empty-state">Loading…</div></div>`;
  try {
    state.residents = await api('/residents');
    renderResidents();
  } catch (e) {
    el.innerHTML = `<div class="card"><div class="empty-state-title">Couldn't load residents</div><div>${e.message}</div></div>`;
  }
}

function renderResidents() {
  const el = document.getElementById('screen-residents');

  const filterBar = `
    <div class="row-3" style="margin-bottom:14px;">
      <button class="btn ${residentFilter === 'active' ? 'btn-primary' : 'btn-outline'} btn-sm" style="width:100%;" onclick="setResidentFilter('active')">Active</button>
      <button class="btn ${residentFilter === 'notice_given' ? 'btn-primary' : 'btn-outline'} btn-sm" style="width:100%;" onclick="setResidentFilter('notice_given')">Vacating</button>
      <button class="btn ${residentFilter === 'vacated' ? 'btn-primary' : 'btn-outline'} btn-sm" style="width:100%;" onclick="setResidentFilter('vacated')">Vacated</button>
    </div>
  `;

  let list = state.residents.filter(r => r.status === residentFilter);
  if (residentFilter === 'notice_given') {
    list = list.sort((a, b) => (a.planned_vacate_date || '9999').localeCompare(b.planned_vacate_date || '9999'));
  }

  if (list.length === 0) {
    el.innerHTML = filterBar + `
      <div class="card"><div class="empty-state">
        <div class="empty-state-title">No one here</div>
        <div>${residentFilter === 'active' ? 'Tap + to add a resident.' : 'Nothing in this list right now.'}</div>
      </div></div>
    `;
    return;
  }

  el.innerHTML = filterBar + `
    <div class="card">
      ${list.map(r => `
        <div class="list-row" onclick="openResidentDetail(${r.id})" style="cursor:pointer;">
          <div class="list-row-main">
            <div class="list-row-title">${escapeHtml(r.name)}</div>
            <div class="list-row-sub">${r.floor || '—'} ${r.room_number || ''}${r.bed_label ? '-' + r.bed_label : ''} · ${escapeHtml(r.phone)}</div>
          </div>
          ${r.status === 'notice_given'
            ? `<span class="badge badge-amber">Leaves ${fmtDate(r.planned_vacate_date)}</span>`
            : r.status === 'vacated'
              ? `<span class="badge badge-gray">Vacated</span>`
              : `<span class="badge badge-green">Active</span>`}
        </div>
      `).join('')}
    </div>
  `;
}

function setResidentFilter(f) {
  residentFilter = f;
  renderResidents();
}

async function openResidentDetail(id) {
  try {
    const r = await api(`/residents/${id}`);
    showResidentDetailModal(r);
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function showResidentDetailModal(r) {
  openModal(`
    <div class="modal-header">
      <div class="modal-title">${escapeHtml(r.name)}</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>

    <div class="card" style="margin-bottom:12px;">
      <div class="list-row"><div class="list-row-main"><div class="list-row-sub">Phone</div></div><div>${escapeHtml(r.phone)}</div></div>
      ${r.alt_phone ? `<div class="list-row"><div class="list-row-main"><div class="list-row-sub">Alt Phone</div></div><div>${escapeHtml(r.alt_phone)}</div></div>` : ''}
      <div class="list-row"><div class="list-row-main"><div class="list-row-sub">Room</div></div><div>${r.floor || '—'} ${r.room_number || ''}${r.bed_label ? '-' + r.bed_label : ''}</div></div>
      <div class="list-row"><div class="list-row-main"><div class="list-row-sub">Joined</div></div><div>${fmtDate(r.join_date)}</div></div>
      <div class="list-row"><div class="list-row-main"><div class="list-row-sub">Advance Paid</div></div><div>${fmtMoney(r.advance_paid)}</div></div>
      ${r.occupation ? `<div class="list-row"><div class="list-row-main"><div class="list-row-sub">Occupation</div></div><div>${escapeHtml(r.occupation)}</div></div>` : ''}
      ${r.emergency_contact_name ? `<div class="list-row"><div class="list-row-main"><div class="list-row-sub">Emergency Contact</div></div><div>${escapeHtml(r.emergency_contact_name)} (${escapeHtml(r.emergency_contact_phone || '')})</div></div>` : ''}
    </div>

    ${r.status === 'active' ? `
      <button class="btn btn-outline" style="margin-bottom:10px;" onclick="openVacateNoticeForm(${r.id})">Record Vacate Notice</button>
    ` : ''}
    ${r.status === 'notice_given' ? `
      <div class="card" style="margin-bottom:12px; background:var(--amber-bg); border-color:var(--amber);">
        <div class="card-title" style="color:var(--amber);">Vacate Notice</div>
        <div class="list-row"><div class="list-row-main"><div class="list-row-sub">Notified on</div></div><div>${fmtDate(r.notice_date)}</div></div>
        <div class="list-row"><div class="list-row-main"><div class="list-row-sub">Planned vacate date</div></div><div>${fmtDate(r.planned_vacate_date)}</div></div>
      </div>
      <button class="btn btn-danger" style="margin-bottom:10px;" onclick="confirmMarkVacated(${r.id})">Mark as Vacated &amp; Free Bed</button>
    ` : ''}

    <div class="card-title" style="margin-top:8px;">Payment History</div>
    ${r.payments.length === 0 ? `<div class="empty-state" style="padding:18px;">No payments recorded yet.</div>` :
      r.payments.slice(0, 10).map(p => `
        <div class="list-row">
          <div class="list-row-main">
            <div class="list-row-title">${fmtMoney(p.amount)} <span style="color:var(--ink-soft);font-weight:500;font-size:12px;">(${p.payment_type})</span></div>
            <div class="list-row-sub">${fmtDate(p.payment_date)} · ${p.payment_mode} · by ${escapeHtml(p.collected_by || '—')}</div>
          </div>
        </div>
      `).join('')
    }
  `);
}

function openVacateNoticeForm(residentId) {
  const today = new Date().toISOString().slice(0, 10);
  openModal(`
    <div class="modal-header">
      <div class="modal-title">Record Vacate Notice</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <p style="font-size:13px;color:var(--ink-soft);margin-bottom:14px;">
      Per house rules, advance won't be refunded if notice is given less than one month before vacating.
    </p>
    <label>Notice Date</label>
    <input id="vac-notice-date" type="date" value="${today}">
    <label>Planned Vacate Date</label>
    <input id="vac-vacate-date" type="date">
    <button class="btn btn-primary" onclick="submitVacateNotice(${residentId})">Save Notice</button>
  `);
}

async function submitVacateNotice(residentId) {
  const notice_date = document.getElementById('vac-notice-date').value;
  const planned_vacate_date = document.getElementById('vac-vacate-date').value;
  if (!notice_date || !planned_vacate_date) {
    showToast('Please fill both dates.', 'error');
    return;
  }
  try {
    await api(`/residents/${residentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'notice_given', notice_date, planned_vacate_date }),
    });
    closeModal();
    showToast('Vacate notice recorded.', 'success');
    loadResidents();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function confirmMarkVacated(residentId) {
  openModal(`
    <div class="modal-header">
      <div class="modal-title">Confirm Vacate</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <p style="margin-bottom:16px;">This frees up their bed for a new resident. Record any refund paid below (optional).</p>
    <label>Refund Amount Paid (if any)</label>
    <input id="vac-refund-amount" type="number" placeholder="0">
    <button class="btn btn-danger" onclick="submitMarkVacated(${residentId})">Confirm — Mark Vacated</button>
  `);
}

async function submitMarkVacated(residentId) {
  const refund = parseInt(document.getElementById('vac-refund-amount').value, 10) || 0;
  try {
    await api(`/residents/${residentId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'vacated',
        refund_paid: refund,
        refund_paid_date: refund > 0 ? new Date().toISOString().slice(0, 10) : null,
      }),
    });
    closeModal();
    showToast('Resident marked as vacated.', 'success');
    loadResidents();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ---- Add resident ----
async function openAddResidentModal(preselectedBedId) {
  if (state.rooms.length === 0) {
    state.rooms = await api('/rooms');
  }
  const vacantBeds = [];
  state.rooms.forEach(room => {
    room.beds.forEach(bed => {
      if (!bed.occupied) {
        vacantBeds.push({ id: bed.id, label: `${room.floor} ${room.room_number}-${bed.label} (${fmtMoney(room.monthly_rent)}/mo)` });
      }
    });
  });

  const today = new Date().toISOString().slice(0, 10);

  openModal(`
    <div class="modal-header">
      <div class="modal-title">Add Resident</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <label>Full Name</label>
    <input id="res-name" placeholder="Resident's name">
    <label>Phone</label>
    <input id="res-phone" placeholder="10-digit phone number">
    <label>Bed</label>
    <select id="res-bed">
      <option value="">Select a vacant bed</option>
      ${vacantBeds.map(b => `<option value="${b.id}" ${preselectedBedId === b.id ? 'selected' : ''}>${b.label}</option>`).join('')}
    </select>
    <label>Join Date</label>
    <input id="res-join" type="date" value="${today}">
    <label>Advance Paid</label>
    <input id="res-advance" type="number" placeholder="0">
    <label>Occupation</label>
    <select id="res-occupation">
      <option value="Student">Student</option>
      <option value="Working Professional">Working Professional</option>
    </select>
    <label>Emergency Contact Name</label>
    <input id="res-emergency-name" placeholder="Optional">
    <label>Emergency Contact Phone</label>
    <input id="res-emergency-phone" placeholder="Optional">
    <button class="btn btn-primary" onclick="submitAddResident()">Save Resident</button>
  `);
}

async function submitAddResident() {
  const name = document.getElementById('res-name').value.trim();
  const phone = document.getElementById('res-phone').value.trim();
  const bed_id = parseInt(document.getElementById('res-bed').value, 10);
  const join_date = document.getElementById('res-join').value;
  const advance_paid = parseInt(document.getElementById('res-advance').value, 10) || 0;
  const occupation = document.getElementById('res-occupation').value;
  const emergency_contact_name = document.getElementById('res-emergency-name').value.trim();
  const emergency_contact_phone = document.getElementById('res-emergency-phone').value.trim();

  if (!name || !phone || !bed_id || !join_date) {
    showToast('Name, phone, bed and join date are required.', 'error');
    return;
  }

  try {
    await api('/residents', {
      method: 'POST',
      body: JSON.stringify({ name, phone, bed_id, join_date, advance_paid, occupation, emergency_contact_name, emergency_contact_phone }),
    });
    closeModal();
    showToast('Resident added.', 'success');
    loadResidents();
    state.rooms = await api('/rooms'); // refresh occupancy cache
  } catch (e) {
    showToast(e.message, 'error');
  }
}
