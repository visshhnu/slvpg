// ===== Residents screen =====

let residentFilter = 'active';
let pendingResidentDocs = {};
let pendingEditResidentDocs = {};

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

  el.innerHTML = filterBar + list.map(r => renderResidentCard(r)).join('') + `<div style="height:16px;"></div>`;
}

function setResidentFilter(f) {
  residentFilter = f;
  renderResidents();
}

function renderResidentCard(r) {
  const rent = r.rent_this_month;
  const advExpected = r.advance_deposit || 0;
  const advPaid = r.advance_paid || 0;
  const advBalance = advExpected - advPaid;

  // Grace period: new residents (joined <=3 days ago) don't get red check-in warning yet
  const joinedDaysAgo = r.join_date
    ? Math.floor((Date.now() - new Date(r.join_date).getTime()) / 86400000)
    : 999;
  const checkinUrgent = !r.has_checkin_receipt && joinedDaysAgo > 3;

  // Border: red only for genuinely overdue rent; amber for softer issues
  const hasIssue = rent && rent.status === 'overdue';
  const hasWarning = (rent && (rent.status === 'partial'))
    || advBalance > 0 || checkinUrgent;
  const borderStyle = hasIssue ? 'border-left:3px solid var(--red,#B23B3B);'
    : hasWarning ? 'border-left:3px solid var(--gold,#C99A3E);' : '';

  // Smart money format — avoids ₹10,500 showing as ₹11k
  function fmtBal(n) {
    if (n >= 100000) return '₹' + (n/100000).toFixed(1).replace('.0','') + 'L';
    if (n >= 1000)   return fmtMoney(n); // show exact: ₹10,500 not ₹11k
    return fmtMoney(n);
  }

  // Rent badge
  let rentBadge = '';
  if (r.status === 'active' || r.status === 'notice_given') {
    if (!rent) {
      rentBadge = `<span class="badge badge-gray">No rent entry yet</span>`;
    } else if (rent.status === 'paid') {
      rentBadge = `<span class="badge badge-green">Rent paid</span>`;
    } else if (rent.status === 'overdue') {
      const bal = rent.amount_due - rent.amount_paid;
      rentBadge = `<span class="badge badge-red">Overdue — ${fmtBal(bal)}</span>`;
    } else if (rent.status === 'partial') {
      const bal = rent.amount_due - rent.amount_paid;
      rentBadge = `<span class="badge badge-amber">Partial — ${fmtBal(bal)} left</span>`;
    } else {
      // pending = due date not passed yet, totally normal
      rentBadge = `<span class="badge badge-gray">Rent due 5th</span>`;
    }
  }

  // Advance badge — show exact amounts, only when balance remains
  const advBadge = advExpected > 0 && advBalance > 0
    ? `<span class="badge badge-amber">Advance ${fmtBal(advPaid)}/${fmtBal(advExpected)}</span>`
    : '';

  // Check-in badge — gray (not red) within grace period
  const checkinBadge = r.has_checkin_receipt
    ? `<span class="badge badge-green">Check-in done</span>`
    : checkinUrgent
      ? `<span class="badge badge-red">No check-in receipt</span>`
      : `<span class="badge badge-gray">Check-in pending</span>`;

  const vacateBadge = r.status === 'notice_given'
    ? `<span class="badge badge-amber">Leaves ${fmtDate(r.planned_vacate_date)}</span>` : '';
  const vacatedBadge = r.status === 'vacated'
    ? `<span class="badge badge-gray">Vacated</span>` : '';

  // Progress bar — partial and overdue only; pending has nothing to show yet
  let progressBar = '';
  if (rent && rent.amount_due > 0 && rent.status !== 'paid' && rent.status !== 'pending') {
    const pct = Math.round((rent.amount_paid / rent.amount_due) * 100);
    const fillColor = rent.status === 'overdue' ? 'var(--red,#B23B3B)' : 'var(--gold,#C99A3E)';
    progressBar = `
      <div style="margin-top:8px;">
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--ink-soft);margin-bottom:3px;">
          <span>Rent this month</span><span>${fmtMoney(rent.amount_paid)} of ${fmtMoney(rent.amount_due)}</span>
        </div>
        <div style="height:4px;background:var(--border);border-radius:99px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:${fillColor};border-radius:99px;"></div>
        </div>
      </div>`;
  }

  return `
    <div class="card" style="margin-bottom:8px;cursor:pointer;${borderStyle}" onclick="openResidentDetail(${r.id})">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
        <div style="min-width:0;">
          <div style="font-size:14px;font-weight:500;">${escapeHtml(r.name)}</div>
          <div style="font-size:11px;color:var(--ink-soft);margin-top:2px;">
            ${r.floor || '—'} ${r.room_number || ''}${r.bed_label ? '-' + r.bed_label : ''} · ${escapeHtml(r.phone)}
          </div>
        </div>
        <div style="font-size:11px;color:var(--ink-soft);white-space:nowrap;flex-shrink:0;">
          Joined ${fmtDate(r.join_date)}
        </div>
      </div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:7px;">
        ${rentBadge}${advBadge}${checkinBadge}${vacateBadge}${vacatedBadge}
      </div>
      ${progressBar}
    </div>`;
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

    ${(r.aadhaar_photo_url || r.pan_photo_url || r.pan_number || r.aadhaar_back_photo_url || r.passport_photo_url) ? `
      <div class="card" style="margin-bottom:12px;">
        <div class="card-title">Identity Documents</div>
        ${r.aadhaar_photo_url ? `<p style="font-size:12px;color:var(--ink-soft);margin-bottom:4px;">Aadhaar — Front</p><img src="${r.aadhaar_photo_url}" class="doc-preview" style="max-height:200px;">` : ''}
        ${r.aadhaar_back_photo_url ? `<p style="font-size:12px;color:var(--ink-soft);margin:8px 0 4px;">Aadhaar — Back</p><img src="${r.aadhaar_back_photo_url}" class="doc-preview" style="max-height:200px;">` : ''}
        ${r.pan_number ? `<div class="list-row"><div class="list-row-main"><div class="list-row-sub">PAN</div></div><div>${escapeHtml(r.pan_number)}</div></div>` : ''}
        ${r.pan_photo_url ? `<p style="font-size:12px;color:var(--ink-soft);margin:8px 0 4px;">PAN Card</p><img src="${r.pan_photo_url}" class="doc-preview" style="max-height:200px;">` : ''}
        ${r.passport_photo_url ? `<p style="font-size:12px;color:var(--ink-soft);margin:8px 0 4px;">Passport-size Photo</p><img src="${r.passport_photo_url}" class="doc-preview" style="max-height:200px;">` : ''}
      </div>
    ` : `
      <div class="card" style="margin-bottom:12px;border:1px solid #e0a; background:#fff4f4;">
        <div class="card-title" style="color:#c0392b;">⚠️ No ID documents submitted yet</div>
        <p style="font-size:12px;color:var(--ink-soft);">Aadhaar and a passport photo are mandatory before move-in. Edit this resident to upload.</p>
      </div>
    `}

    <button class="btn btn-outline" style="margin-bottom:10px;width:100%;" onclick="openEditResidentModal(${r.id})">Edit resident details</button>
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

async function openEditResidentModal(residentId) {
  let r;
  try { r = await api(`/residents/${residentId}`); } catch(e) { showToast('Could not load resident.', 'error'); return; }

  openModal(`
    <div class="modal-header">
      <div class="modal-title">Edit — ${escapeHtml(r.name)}</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>

    <div style="font-size:11px;color:var(--ink-soft);margin-bottom:12px;">Update any details below. Leave a field blank to keep it unchanged.</div>

    <label>Full name</label>
    <input id="er-name" value="${escapeHtml(r.name || '')}">

    <label>Phone</label>
    <input id="er-phone" type="tel" value="${escapeHtml(r.phone || '')}">

    <label>Alt phone</label>
    <input id="er-altphone" type="tel" value="${escapeHtml(r.alt_phone || '')}">

    <label>Aadhaar number</label>
    <input id="er-aadhaar" value="${escapeHtml(r.aadhaar_number || '')}">

    <label>PAN number</label>
    <input id="er-pan" value="${escapeHtml(r.pan_number || '')}">

    <label>Occupation</label>
    <input id="er-occ" value="${escapeHtml(r.occupation || '')}">

    <label>Company / College</label>
    <input id="er-company" value="${escapeHtml(r.company_or_college || '')}">

    <label>Emergency contact name</label>
    <input id="er-emname" value="${escapeHtml(r.emergency_contact_name || '')}">

    <label>Emergency contact phone</label>
    <input id="er-emphone" type="tel" value="${escapeHtml(r.emergency_contact_phone || '')}">

    <label>Police verification</label>
    <select id="er-police">
      <option value="pending" ${(r.police_verification_status||'pending')==='pending'?'selected':''}>Pending</option>
      <option value="submitted" ${r.police_verification_status==='submitted'?'selected':''}>Submitted</option>
      <option value="verified" ${r.police_verification_status==='verified'?'selected':''}>Verified</option>
    </select>

    <label>Agreement signed</label>
    <select id="er-agreement">
      <option value="0" ${!r.agreement_signed?'selected':''}>No</option>
      <option value="1" ${r.agreement_signed?'selected':''}>Yes</option>
    </select>

    <label>Custom rent for this bed <span style="font-weight:400;color:var(--ink-soft);">(leave blank to use room's default rent)</span></label>
    <input id="er-custom-rent" type="number" value="${r.custom_rent != null ? r.custom_rent : ''}" placeholder="Room default: ${fmtMoney(r.monthly_rent || 0)}">

    <div class="card" style="margin:14px 0;">
      <div class="card-title">Identity Documents</div>
      <p style="font-size:12px;color:var(--ink-soft);margin:-4px 0 10px;">Upload a new photo only if you need to replace the existing one.</p>
      <label>Aadhaar Photo — Front</label>
      <input type="file" id="er-aadhaar-file" accept="image/*">
      <img id="er-aadhaar-preview" class="hidden doc-preview" src="${r.aadhaar_photo_url || ''}" ${r.aadhaar_photo_url ? '' : 'style="display:none;"'}>

      <label style="margin-top:10px;">Aadhaar Photo — Back</label>
      <input type="file" id="er-aadhaar-back-file" accept="image/*">
      <img id="er-aadhaar-back-preview" class="hidden doc-preview" src="${r.aadhaar_back_photo_url || ''}" ${r.aadhaar_back_photo_url ? '' : 'style="display:none;"'}>

      <label style="margin-top:10px;">PAN Photo</label>
      <input type="file" id="er-pan-file" accept="image/*">
      <img id="er-pan-preview" class="hidden doc-preview" src="${r.pan_photo_url || ''}" ${r.pan_photo_url ? '' : 'style="display:none;"'}>

      <label style="margin-top:10px;">Passport-size Photo (face)</label>
      <input type="file" id="er-passport-file" accept="image/*">
      <img id="er-passport-preview" class="hidden doc-preview" src="${r.passport_photo_url || ''}" ${r.passport_photo_url ? '' : 'style="display:none;"'}>
    </div>

    <label>Notes</label>
    <textarea id="er-notes" rows="3">${escapeHtml(r.notes || '')}</textarea>

    <button class="btn btn-primary" style="margin-top:16px;width:100%;" onclick="submitEditResident(${residentId})">Save changes</button>
  `);

  pendingEditResidentDocs = {};
  wireImageUpload('er-aadhaar-file', 'er-aadhaar-preview', (dataUrl) => { pendingEditResidentDocs.aadhaar_photo_url = dataUrl; });
  wireImageUpload('er-aadhaar-back-file', 'er-aadhaar-back-preview', (dataUrl) => { pendingEditResidentDocs.aadhaar_back_photo_url = dataUrl; });
  wireImageUpload('er-pan-file', 'er-pan-preview', (dataUrl) => { pendingEditResidentDocs.pan_photo_url = dataUrl; });
  wireImageUpload('er-passport-file', 'er-passport-preview', (dataUrl) => { pendingEditResidentDocs.passport_photo_url = dataUrl; });
}

async function submitEditResident(residentId) {
  const customRentRaw = document.getElementById('er-custom-rent').value;
  const body = {
    name: document.getElementById('er-name').value.trim(),
    phone: document.getElementById('er-phone').value.trim(),
    alt_phone: document.getElementById('er-altphone').value.trim() || null,
    aadhaar_number: document.getElementById('er-aadhaar').value.trim() || null,
    pan_number: document.getElementById('er-pan').value.trim() || null,
    occupation: document.getElementById('er-occ').value.trim() || null,
    company_or_college: document.getElementById('er-company').value.trim() || null,
    emergency_contact_name: document.getElementById('er-emname').value.trim() || null,
    emergency_contact_phone: document.getElementById('er-emphone').value.trim() || null,
    police_verification_status: document.getElementById('er-police').value,
    agreement_signed: document.getElementById('er-agreement').value === '1',
    custom_rent: customRentRaw ? parseInt(customRentRaw, 10) : null,
    notes: document.getElementById('er-notes').value.trim() || null,
    ...(pendingEditResidentDocs || {}),
  };

  if (!body.name || !body.phone) {
    showToast('Name and phone are required.', 'error'); return;
  }

  try {
    await api(`/residents/${residentId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    closeModal();
    showToast('Resident details updated.', 'success');
    loadResidents();
  } catch(e) {
    showToast(e.message, 'error');
  }
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
  pendingResidentDocs = { aadhaar_photo_url: null, aadhaar_back_photo_url: null, pan_photo_url: null, id_proof_photo_url: null, passport_photo_url: null };

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
    <label>Custom Rent for this bed <span style="font-weight:400;color:var(--ink-soft);">(leave blank to use room's default rent)</span></label>
    <input id="res-custom-rent" type="number" placeholder="Leave blank for room default">
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
      <p style="font-size:12px;color:var(--ink-soft);margin:-4px 0 10px;">All four are required before move-in — this is mandatory per house rules.</p>
      <label>Aadhaar Number</label>
      <input id="res-aadhaar" placeholder="XXXX XXXX XXXX">
      <label>Aadhaar Photo — Front</label>
      <input type="file" id="res-aadhaar-file" accept="image/*">
      <img id="res-aadhaar-preview" class="hidden doc-preview">

      <label style="margin-top:10px;">Aadhaar Photo — Back</label>
      <input type="file" id="res-aadhaar-back-file" accept="image/*">
      <img id="res-aadhaar-back-preview" class="hidden doc-preview">

      <label style="margin-top:10px;">PAN Number (optional)</label>
      <input id="res-pan" placeholder="ABCDE1234F">
      <label>PAN Photo</label>
      <input type="file" id="res-pan-file" accept="image/*">
      <img id="res-pan-preview" class="hidden doc-preview">

      <label style="margin-top:10px;">Passport-size Photo (face)</label>
      <input type="file" id="res-passport-file" accept="image/*">
      <img id="res-passport-preview" class="hidden doc-preview">
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
  wireImageUpload('res-aadhaar-back-file', 'res-aadhaar-back-preview', (dataUrl) => { pendingResidentDocs.aadhaar_back_photo_url = dataUrl; });
  wireImageUpload('res-pan-file', 'res-pan-preview', (dataUrl) => { pendingResidentDocs.pan_photo_url = dataUrl; });
  wireImageUpload('res-passport-file', 'res-passport-preview', (dataUrl) => { pendingResidentDocs.passport_photo_url = dataUrl; });
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
  const customRentRaw = document.getElementById('res-custom-rent').value;
  const custom_rent = customRentRaw ? parseInt(customRentRaw, 10) : null;

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
        police_verification_status, agreement_signed, custom_rent,
        aadhaar_photo_url: pendingResidentDocs.aadhaar_photo_url,
        aadhaar_back_photo_url: pendingResidentDocs.aadhaar_back_photo_url,
        pan_photo_url: pendingResidentDocs.pan_photo_url,
        passport_photo_url: pendingResidentDocs.passport_photo_url,
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
