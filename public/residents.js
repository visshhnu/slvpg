// ===== Residents screen =====

let residentFilter = 'active';
let pendingResidentDocs = {};

async function loadResidents() {
  const el = document.getElementById('screen-residents');
  el.innerHTML = `<div class="card"><div class="empty-state">Loading…</div></div>`;
  if (!state.currentPgId) {
    el.innerHTML = `<div class="card"><div class="empty-state"><div class="empty-state-title">No PG selected</div></div></div>`;
    return;
  }
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

function policeVerifBadge(status) {
  if (status === 'verified') return `<span class="badge badge-green">Verified</span>`;
  if (status === 'submitted') return `<span class="badge badge-amber">Submitted</span>`;
  return `<span class="badge badge-red">Pending</span>`;
}

function showResidentDetailModal(r) {
  openModal(`
    <div class="modal-header">
      <div class="modal-title">${escapeHtml(r.name)}</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>

    ${r.photo_url ? `<img src="${escapeHtml(r.photo_url)}" style="width:80px;height:80px;border-radius:12px;object-fit:cover;margin-bottom:12px;">` : ''}

    <div class="card" style="margin-bottom:12px;">
      <div class="list-row"><div class="list-row-main"><div class="list-row-sub">Phone</div></div><div>${escapeHtml(r.phone)}</div></div>
      ${r.alt_phone ? `<div class="list-row"><div class="list-row-main"><div class="list-row-sub">Alt Phone</div></div><div>${escapeHtml(r.alt_phone)}</div></div>` : ''}
      ${r.aadhaar_number ? `<div class="list-row"><div class="list-row-main"><div class="list-row-sub">Aadhaar</div></div><div>${escapeHtml(r.aadhaar_number)}</div></div>` : ''}
      <div class="list-row"><div class="list-row-main"><div class="list-row-sub">Room</div></div><div>${r.floor || '—'} ${r.room_number || ''}${r.bed_label ? '-' + r.bed_label : ''}</div></div>
      <div class="list-row"><div class="list-row-main"><div class="list-row-sub">Joined</div></div><div>${fmtDate(r.join_date)}</div></div>
      <div class="list-row"><div class="list-row-main"><div class="list-row-sub">Advance Paid</div></div><div>${fmtMoney(r.advance_paid)}</div></div>
      ${r.occupation ? `<div class="list-row"><div class="list-row-main"><div class="list-row-sub">Occupation</div></div><div>${escapeHtml(r.occupation)}</div></div>` : ''}
      ${r.company_or_college ? `<div class="list-row"><div class="list-row-main"><div class="list-row-sub">Company/College</div></div><div>${escapeHtml(r.company_or_college)}</div></div>` : ''}
      ${r.emergency_contact_name ? `<div class="list-row"><div class="list-row-main"><div class="list-row-sub">Emergency Contact</div></div><div>${escapeHtml(r.emergency_contact_name)} (${escapeHtml(r.emergency_contact_phone || '')})</div></div>` : ''}
      <div class="list-row"><div class="list-row-main"><div class="list-row-sub">Agreement Signed</div></div><div>${r.agreement_signed ? '✅ Yes' : '❌ No'}</div></div>
      <div class="list-row"><div class="list-row-main"><div class="list-row-sub">Police Verification</div></div><div>${policeVerifBadge(r.police_verification_status)}</div></div>
    </div>

    ${(r.aadhaar_photo_url || r.pan_photo_url || r.pan_number) ? `
      <div class="card" style="margin-bottom:12px;">
        <div class="card-title">Identity Documents</div>
        ${r.aadhaar_photo_url ? `<p style="font-size:12px;color:var(--ink-soft);margin-bottom:4px;">Aadhaar</p><img src="${r.aadhaar_photo_url}" class="doc-preview" style="max-height:200px;">` : ''}
        ${r.pan_number ? `<div class="list-row"><div class="list-row-main"><div class="list-row-sub">PAN</div></div><div>${escapeHtml(r.pan_number)}</div></div>` : ''}
        ${r.pan_photo_url ? `<p style="font-size:12px;color:var(--ink-soft);margin:8px 0 4px;">PAN Card</p><img src="${r.pan_photo_url}" class="doc-preview" style="max-height:200px;">` : ''}
      </div>
    ` : ''}

    <button class="btn btn-outline" style="margin-bottom:10px;" onclick="openCheckinReceiptArea(${r.id})">Check-in Receipt</button>

    ${r.status === 'active' ? `
      <button class="btn btn-outline" style="margin-bottom:10px;" onclick="openVacateNoticeForm(${r.id})">Record Vacate Notice</button>
    ` : ''}
    ${r.status === 'notice_given' ? `
      <div class="card" style="margin-bottom:12px; background:var(--amber-bg); border-color:var(--amber);">
        <div class="card-title" style="color:var(--amber);">Vacate Notice</div>
        <div class="list-row"><div class="list-row-main"><div class="list-row-sub">Notified on</div></div><div>${fmtDate(r.notice_date)}</div></div>
        <div class="list-row"><div class="list-row-main"><div class="list-row-sub">Planned vacate date</div></div><div>${fmtDate(r.planned_vacate_date)}</div></div>
        ${r.refund_eligibility ? `
          <div class="list-row"><div class="list-row-main"><div class="list-row-sub">Notice given</div></div><div>${r.refund_eligibility.notice_days_given} days before</div></div>
          <div class="list-row"><div class="list-row-main"><div class="list-row-sub">Refund Eligibility</div></div><div><span class="badge ${r.refund_eligibility.eligible ? 'badge-green' : 'badge-red'}">${r.refund_eligibility.eligible ? 'Eligible' : 'Not eligible'}</span></div></div>
        ` : ''}
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
          <button class="btn btn-outline btn-sm" onclick="openFlagCorrectionModal('payment', ${p.id})">Flag Issue</button>
        </div>
      `).join('')
    }
  `);
}

async function openCheckinReceiptArea(residentId) {
  let receipts;
  try {
    receipts = await api(`/checkin-receipts?resident_id=${residentId}`);
  } catch (e) {
    showToast(e.message, 'error');
    return;
  }

  if (receipts.length === 0) {
    openModal(`
      <div class="modal-header">
        <div class="modal-title">Check-in Receipt</div>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <p style="font-size:13px;color:var(--ink-soft);margin-bottom:16px;">
        No receipt generated yet. This will create a permanent, locked record of the room's
        condition, the agreed rent/deposit, and the house rules at this moment — it can never be edited afterward.
      </p>
      <button class="btn btn-primary" onclick="submitGenerateReceipt(${residentId})">Generate Check-in Receipt</button>
    `);
    return;
  }

  openModal(`
    <div class="modal-header">
      <div class="modal-title">Check-in Receipts</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    ${receipts.map(r => `
      <div class="list-row" onclick="viewReceipt(${r.id})" style="cursor:pointer;">
        <div class="list-row-main">
          <div class="list-row-title">${escapeHtml(r.receipt_number)}</div>
          <div class="list-row-sub">Generated ${fmtDate(r.created_at.slice(0,10))} by ${escapeHtml(r.generated_by)}</div>
        </div>
        <span class="badge badge-gray">View</span>
      </div>
    `).join('')}
    <p style="font-size:12px;color:var(--ink-soft);text-align:center;margin-top:12px;">Need a new one (e.g. resident moved rooms)? Generating again keeps the old receipt on file too.</p>
    <button class="btn btn-outline" style="margin-top:6px;" onclick="submitGenerateReceipt(${residentId})">Generate New Receipt</button>
  `);
}

async function submitGenerateReceipt(residentId) {
  try {
    const result = await api('/checkin-receipts', {
      method: 'POST',
      body: JSON.stringify({ resident_id: residentId }),
    });
    showToast(`Receipt ${result.receipt_number} generated.`, 'success');
    viewReceipt(result.id);
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function viewReceipt(receiptId) {
  let r;
  try {
    r = await api(`/checkin-receipts/${receiptId}`);
  } catch (e) {
    showToast(e.message, 'error');
    return;
  }

  const pg = state.pgList.find(p => p.id === r.pg_id);

  openModal(`
    <div class="modal-header">
      <div class="modal-title">${escapeHtml(r.receipt_number)}</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div id="receipt-printable">
      <div class="card" style="margin-bottom:12px;">
        <div style="text-align:center;margin-bottom:10px;">
          <div style="font-weight:800;font-size:16px;color:var(--navy);">${pg ? escapeHtml(pg.name) : ''}</div>
          <div style="font-size:12px;color:var(--ink-soft);">Check-in Receipt · ${escapeHtml(r.receipt_number)}</div>
        </div>
        <div class="list-row"><div class="list-row-main"><div class="list-row-sub">Resident</div></div><div>${escapeHtml(r.resident_name)}</div></div>
        <div class="list-row"><div class="list-row-main"><div class="list-row-sub">Phone</div></div><div>${escapeHtml(r.resident_phone || '—')}</div></div>
        <div class="list-row"><div class="list-row-main"><div class="list-row-sub">Room</div></div><div>${r.room_floor} ${r.room_number}-${r.bed_label} (${sharingLabelFromType(r.sharing_type)})</div></div>
        <div class="list-row"><div class="list-row-main"><div class="list-row-sub">Join Date</div></div><div>${fmtDate(r.join_date)}</div></div>
        <div class="list-row"><div class="list-row-main"><div class="list-row-sub">Monthly Rent</div></div><div>${fmtMoney(r.monthly_rent)}</div></div>
        <div class="list-row"><div class="list-row-main"><div class="list-row-sub">Advance Deposit (full)</div></div><div>${fmtMoney(r.advance_deposit)}</div></div>
        <div class="list-row"><div class="list-row-main"><div class="list-row-sub">Refundable Amount</div></div><div>${fmtMoney(r.refundable_amount)}</div></div>
        <div class="list-row"><div class="list-row-main"><div class="list-row-sub">Advance Paid at Check-in</div></div><div>${fmtMoney(r.advance_paid_now)}</div></div>
      </div>

      <div class="card-title">Room Condition at Check-in</div>
      <div class="card" style="margin-bottom:12px;">
        ${r.room_condition_snapshot.map(f => `
          <div class="list-row">
            <div class="list-row-main"><div class="list-row-title" style="font-size:13px;">${escapeHtml(f.item_name)} ×${f.quantity}</div></div>
            <span class="badge ${f.condition === 'good' ? 'badge-green' : 'badge-red'}">${f.condition}</span>
          </div>
        `).join('')}
      </div>

      <div class="card-title">House Rules &amp; Terms</div>
      <div class="card" style="margin-bottom:12px;">
        <pre style="white-space:pre-wrap;font-family:inherit;font-size:12.5px;line-height:1.6;margin:0;">${escapeHtml(r.terms_snapshot)}</pre>
      </div>
      <p style="font-size:11px;color:var(--ink-soft);text-align:center;">Generated ${fmtDate(r.created_at.slice(0,10))} by ${escapeHtml(r.generated_by)} · This receipt is permanent and cannot be edited.</p>
    </div>
    <button class="btn btn-primary" style="margin-top:14px;" onclick="printReceipt()">Print / Save as PDF</button>
  `);
}

function sharingLabelFromType(type) {
  return { single: 'Single Sharing', double: 'Double Sharing', triple: 'Triple Sharing' }[type] || type;
}

function printReceipt() {
  const content = document.getElementById('receipt-printable').innerHTML;
  const win = window.open('', '_blank');
  win.document.write(`
    <html><head><title>Check-in Receipt</title>
    <style>body{font-family:-apple-system,sans-serif;padding:24px;color:#262321;} .list-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee;} .badge{padding:2px 8px;border-radius:10px;font-size:11px;background:#eee;} .card{margin-bottom:16px;} pre{white-space:pre-wrap;font-size:12px;}</style>
    </head><body>${content}</body></html>
  `);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}

// ---- Flag a correction (staff-facing, on payments/expenses) ----
function openFlagCorrectionModal(recordType, recordId) {
  openModal(`
    <div class="modal-header">
      <div class="modal-title">Flag a Correction</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <p style="font-size:13px;color:var(--ink-soft);margin-bottom:14px;">
      You can't delete this directly — describe what's wrong and the admin will review and fix it.
    </p>
    <label>What's wrong?</label>
    <textarea id="flag-reason" rows="3" placeholder="e.g. Typed 120000 instead of 12000"></textarea>
    <button class="btn btn-primary" onclick="submitFlagCorrection('${recordType}', ${recordId})">Submit Flag</button>
  `);
}

async function submitFlagCorrection(recordType, recordId) {
  const reason = document.getElementById('flag-reason').value.trim();
  if (!reason) {
    showToast('Please describe the issue.', 'error');
    return;
  }
  try {
    await api('/corrections', {
      method: 'POST',
      body: JSON.stringify({ record_type: recordType, record_id: recordId, reason }),
    });
    closeModal();
    showToast('Flagged for admin review.', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function openVacateNoticeForm(residentId) {
  const today = new Date().toISOString().slice(0, 10);
  openModal(`
    <div class="modal-header">
      <div class="modal-title">Record Vacate Notice</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <p style="font-size:13px;color:var(--ink-soft);margin-bottom:14px;">
      Per house rules, advance won't be refunded if notice is given less than 30 days before vacating. The app calculates this automatically once you save both dates.
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
  pendingResidentDocs = { aadhaar_photo_url: null, pan_photo_url: null, id_proof_photo_url: null };

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
    <label>Company / College (optional)</label>
    <input id="res-company" placeholder="Optional">
    <label>Emergency Contact Name</label>
    <input id="res-emergency-name" placeholder="Optional">
    <label>Emergency Contact Phone</label>
    <input id="res-emergency-phone" placeholder="Optional">

    <div class="card" style="margin:14px 0;">
      <div class="card-title">Identity Documents</div>
      <label>Aadhaar Number</label>
      <input id="res-aadhaar" placeholder="XXXX XXXX XXXX">
      <label>Aadhaar Photo</label>
      <input type="file" id="res-aadhaar-file" accept="image/*">
      <img id="res-aadhaar-preview" class="hidden doc-preview">

      <label style="margin-top:10px;">PAN Number (optional)</label>
      <input id="res-pan" placeholder="ABCDE1234F">
      <label>PAN Photo</label>
      <input type="file" id="res-pan-file" accept="image/*">
      <img id="res-pan-preview" class="hidden doc-preview">
    </div>

    <label>Police Verification</label>
    <select id="res-police">
      <option value="pending">Pending</option>
      <option value="submitted">Submitted</option>
      <option value="verified">Verified</option>
    </select>
    <label style="display:flex;align-items:center;gap:8px;margin-top:4px;">
      <input type="checkbox" id="res-agreement" style="width:auto;margin:0;"> Agreement Signed
    </label>
    <button class="btn btn-primary" style="margin-top:14px;" onclick="submitAddResident()">Save Resident</button>
  `);

  wireImageUpload('res-aadhaar-file', 'res-aadhaar-preview', (dataUrl) => { pendingResidentDocs.aadhaar_photo_url = dataUrl; });
  wireImageUpload('res-pan-file', 'res-pan-preview', (dataUrl) => { pendingResidentDocs.pan_photo_url = dataUrl; });
}

async function submitAddResident() {
  const name = document.getElementById('res-name').value.trim();
  const phone = document.getElementById('res-phone').value.trim();
  const aadhaar_number = document.getElementById('res-aadhaar').value.trim();
  const pan_number = document.getElementById('res-pan').value.trim();
  const bed_id = parseInt(document.getElementById('res-bed').value, 10);
  const join_date = document.getElementById('res-join').value;
  const advance_paid = parseInt(document.getElementById('res-advance').value, 10) || 0;
  const occupation = document.getElementById('res-occupation').value;
  const company_or_college = document.getElementById('res-company').value.trim();
  const emergency_contact_name = document.getElementById('res-emergency-name').value.trim();
  const emergency_contact_phone = document.getElementById('res-emergency-phone').value.trim();
  const police_verification_status = document.getElementById('res-police').value;
  const agreement_signed = document.getElementById('res-agreement').checked;

  if (!name || !phone || !bed_id || !join_date) {
    showToast('Name, phone, bed and join date are required.', 'error');
    return;
  }

  try {
    const result = await api('/residents', {
      method: 'POST',
      body: JSON.stringify({
        name, phone, aadhaar_number, pan_number, bed_id, join_date, advance_paid, occupation,
        company_or_college, emergency_contact_name, emergency_contact_phone,
        police_verification_status, agreement_signed,
        aadhaar_photo_url: pendingResidentDocs.aadhaar_photo_url,
        pan_photo_url: pendingResidentDocs.pan_photo_url,
      }),
    });
    closeModal();
    showToast('Resident added. You can generate their check-in receipt from their profile.', 'success');
    loadResidents();
    state.rooms = await api('/rooms'); // refresh occupancy cache
  } catch (e) {
    showToast(e.message, 'error');
  }
}
