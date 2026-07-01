// ===== Settings screen =====

async function loadSettings() {
  const el = document.getElementById('screen-settings');
  el.innerHTML = `<div class="card"><div class="empty-state">Loading…</div></div>`;

  if (state.staff.role !== 'admin') {
    let fixedCharges = [];
    try { fixedCharges = await api('/fixed-charges'); } catch {}
    el.innerHTML = `
      <div class="card">
        <div class="card-title">Logged in as</div>
        <div class="list-row"><div class="list-row-main"><div class="list-row-title">${escapeHtml(state.staff.name)}</div><div class="list-row-sub">Staff account</div></div></div>
      </div>
      <div class="card">
        <div class="card-title">Fixed Charges (reference only)</div>
        ${fixedCharges.length === 0 ? `<div class="empty-state" style="padding:18px;">Nothing set yet.</div>` :
          fixedCharges.map(f => `
            <div class="list-row">
              <div class="list-row-main"><div class="list-row-title" style="font-size:13.5px;">${escapeHtml(f.label)}</div></div>
              <div class="list-row-amount">${fmtMoney(f.amount)}</div>
            </div>
          `).join('')
        }
      </div>
      <div class="card">
        <div class="empty-state">
          <div class="empty-state-title">Staff management</div>
          <div>Only the admin account can add or remove staff logins.</div>
        </div>
      </div>
    `;
    return;
  }

  try {
    const [staffList, fixedCharges, corrections] = await Promise.all([
      api('/staff'), api('/fixed-charges'), api('/corrections?status=open'),
    ]);
    renderSettings(staffList, fixedCharges, corrections);
  } catch (e) {
    el.innerHTML = `<div class="card"><div class="empty-state-title">Couldn't load settings</div><div>${e.message}</div></div>`;
  }
}

function renderSettings(staffList, fixedCharges, corrections) {
  const el = document.getElementById('screen-settings');
  el.innerHTML = `
    <div class="card">
      <div class="card-title">Logged in as</div>
      <div class="list-row"><div class="list-row-main"><div class="list-row-title">${escapeHtml(state.staff.name)}</div><div class="list-row-sub">Admin · sees all PGs</div></div></div>
    </div>

    ${corrections.length > 0 ? `
      <div class="card" style="border-color:var(--red);">
        <div class="card-title" style="color:var(--red);">⚠ Flagged Corrections (${corrections.length})</div>
        ${corrections.map(c => `
          <div class="list-row">
            <div class="list-row-main">
              <div class="list-row-title" style="font-size:13.5px;">${c.record_type === 'payment' ? 'Payment' : 'Expense'}: ${c.record ? fmtMoney(c.record.amount) : '—'}${c.record && c.record.resident_name ? ' · ' + escapeHtml(c.record.resident_name) : ''}</div>
              <div class="list-row-sub">"${escapeHtml(c.reason)}" — flagged by ${escapeHtml(c.raised_by)}</div>
            </div>
            <button class="btn btn-gold btn-sm" onclick="openResolveCorrectionModal(${c.id}, '${c.record_type}', ${c.record_id})">Review</button>
          </div>
        `).join('')}
      </div>
    ` : ''}

    <div class="card">
      <div class="card-title">Fixed Charges</div>
      <p style="font-size:12px;color:var(--ink-soft);margin:-4px 0 10px;">A reference list of your standard recurring costs — not auto-billed, just so the current rate is always one tap away.</p>
      ${fixedCharges.length === 0 ? `<div class="empty-state" style="padding:18px;">No fixed charges set yet.</div>` :
        fixedCharges.map(f => `
          <div class="list-row">
            <div class="list-row-main" onclick="openEditFixedChargeModal(${f.id})" style="cursor:pointer;">
              <div class="list-row-title">${escapeHtml(f.label)}</div>
              ${f.notes ? `<div class="list-row-sub">${escapeHtml(f.notes)}</div>` : ''}
            </div>
            <div style="text-align:right;">
              <div class="list-row-amount">${fmtMoney(f.amount)}</div>
              <button class="btn btn-gold btn-sm" style="margin-top:4px;" onclick="quickLogFixedCharge(${f.id})">Log This Month</button>
            </div>
          </div>
        `).join('')
      }
      <button class="btn btn-outline btn-sm" style="margin-top:10px;width:100%;" onclick="openAddFixedChargeModal()">+ Add Fixed Charge</button>
    </div>

    <div class="card">
      <div class="card-title">Your PGs</div>
      ${state.pgList.map(pg => `
        <div class="list-row">
          <div class="list-row-main" onclick="openEditPgModal(${pg.id})" style="cursor:pointer;">
            <div class="list-row-title">${escapeHtml(pg.name)}</div>
            <div class="list-row-sub">${pg.landlord_name ? 'Landlord: ' + escapeHtml(pg.landlord_name) : 'No landlord set'}</div>
          </div>
          <button class="btn btn-gold btn-sm" onclick="openPropertyPageEditor(${pg.id})">Property page</button>
        </div>
      `).join('')}
      <button class="btn btn-outline btn-sm" style="margin-top:10px;width:100%;" onclick="openAddPgModal()">+ Add Another PG</button>
    </div>

    <div class="card">
      <div class="card-title">Staff &amp; Warden Logins</div>
      ${staffList.length === 0 ? `<div class="empty-state">No staff added yet.</div>` :
        staffList.map(s => `
          <div class="list-row">
            <div class="list-row-main">
              <div class="list-row-title">${escapeHtml(s.name)}</div>
              <div class="list-row-sub">@${escapeHtml(s.username)} · ${s.pg_name ? escapeHtml(s.pg_name) : 'no PG assigned'}</div>
            </div>
            <span class="badge ${s.role === 'admin' ? 'badge-gold' : 'badge-gray'}">${s.role}</span>
          </div>
        `).join('')
      }
    </div>
    <p style="font-size:12.5px;color:var(--ink-soft);text-align:center;">Tap + to add a new staff login and assign them to a PG.</p>
  `;
}

function openAddStaffModal() {
  openModal(`
    <div class="modal-header">
      <div class="modal-title">Add Staff Login</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <label>Name</label>
    <input id="staff-name" placeholder="Warden's name">
    <label>Phone</label>
    <input id="staff-phone" placeholder="Optional">
    <label>Role</label>
    <select id="staff-role" onchange="toggleStaffPgSelect()">
      <option value="staff">Staff — can view/record, cannot fix corrections</option>
      <option value="pg_manager">PG Manager — can also fix flagged corrections for their PG</option>
    </select>
    <label>Assign to PG</label>
    <select id="staff-pg">
      ${state.pgList.map(pg => `<option value="${pg.id}">${escapeHtml(pg.name)}</option>`).join('')}
    </select>
    <label>Username</label>
    <input id="staff-username" placeholder="e.g. warden1">
    <label>Password</label>
    <input id="staff-password" type="password" placeholder="At least 6 characters">
    <button class="btn btn-primary" onclick="submitAddStaff()">Create Login</button>
  `);
}

function toggleStaffPgSelect() {
  // reserved for future use if admin role needs pg hidden — no-op for now
}

async function submitAddStaff() {
  const name = document.getElementById('staff-name').value.trim();
  const phone = document.getElementById('staff-phone').value.trim();
  const pg_id = parseInt(document.getElementById('staff-pg').value, 10);
  const username = document.getElementById('staff-username').value.trim();
  const password = document.getElementById('staff-password').value;
  const role = document.getElementById('staff-role').value;

  if (!name || !username || !password || !pg_id) {
    showToast('Name, username, password and PG are all required.', 'error');
    return;
  }
  if (password.length < 6) {
    showToast('Password must be at least 6 characters.', 'error');
    return;
  }

  try {
    await api('/staff', {
      method: 'POST',
      body: JSON.stringify({ name, phone, username, password, pg_id, role }),
    });
    closeModal();
    showToast('Staff login created.', 'success');
    loadSettings();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function openEditPgModal(pgId) {
  const pg = state.pgList.find(p => p.id === pgId);
  if (!pg) return;
  openModal(`
    <div class="modal-header">
      <div class="modal-title">Edit PG Details</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <label>PG Name</label>
    <input id="edit-pg-name" value="${escapeHtml(pg.name)}">
    <label>Address</label>
    <input id="edit-pg-address" value="${escapeHtml(pg.address || '')}">
    <label>Contact Phone</label>
    <input id="edit-pg-phone" value="${escapeHtml(pg.contact_phone || '')}">
    <label>Landlord Name</label>
    <input id="edit-pg-landlord-name" value="${escapeHtml(pg.landlord_name || '')}">
    <label>Landlord Phone</label>
    <input id="edit-pg-landlord-phone" value="${escapeHtml(pg.landlord_phone || '')}">
    <button class="btn btn-primary" onclick="submitEditPg(${pgId})">Save Changes</button>
  `);
}

async function submitEditPg(pgId) {
  const name = document.getElementById('edit-pg-name').value.trim();
  const address = document.getElementById('edit-pg-address').value.trim();
  const contact_phone = document.getElementById('edit-pg-phone').value.trim();
  const landlord_name = document.getElementById('edit-pg-landlord-name').value.trim();
  const landlord_phone = document.getElementById('edit-pg-landlord-phone').value.trim();

  try {
    await api(`/pgs/${pgId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name, address, contact_phone, landlord_name, landlord_phone }),
    });
    state.pgList = await api('/pgs');
    updatePgLabel();
    closeModal();
    showToast('PG details updated.', 'success');
    loadSettings();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ---- Fixed Charges ----

function openAddFixedChargeModal() {
  openModal(`
    <div class="modal-header">
      <div class="modal-title">Add Fixed Charge</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <label>Label</label>
    <input id="fc-label" placeholder="e.g. Rent to Landlord, Wi-Fi Plan">
    <label>Category</label>
    <select id="fc-category">
      ${EXPENSE_CATEGORIES.map(c => `<option value="${c.value}">${c.label}</option>`).join('')}
    </select>
    <label>Current Amount</label>
    <input id="fc-amount" type="number" placeholder="0">
    <label>Notes (optional)</label>
    <input id="fc-notes" placeholder="e.g. plan details, due date">
    <button class="btn btn-primary" onclick="submitAddFixedCharge()">Save</button>
  `);
}

async function submitAddFixedCharge() {
  const label = document.getElementById('fc-label').value.trim();
  const category = document.getElementById('fc-category').value;
  const amount = parseInt(document.getElementById('fc-amount').value, 10);
  const notes = document.getElementById('fc-notes').value.trim();

  if (!label || !amount) {
    showToast('Label and amount are required.', 'error');
    return;
  }

  try {
    await api('/fixed-charges', {
      method: 'POST',
      body: JSON.stringify({ label, category, amount, notes }),
    });
    closeModal();
    showToast('Fixed charge saved.', 'success');
    loadSettings();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function openEditFixedChargeModal(id) {
  let charges;
  try {
    charges = await api('/fixed-charges');
  } catch (e) {
    showToast(e.message, 'error');
    return;
  }
  const fc = charges.find(c => c.id === id);
  if (!fc) return;

  openModal(`
    <div class="modal-header">
      <div class="modal-title">Edit Fixed Charge</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <label>Label</label>
    <input id="edit-fc-label" value="${escapeHtml(fc.label)}">
    <label>Category</label>
    <select id="edit-fc-category">
      ${EXPENSE_CATEGORIES.map(c => `<option value="${c.value}" ${c.value === fc.category ? 'selected' : ''}>${c.label}</option>`).join('')}
    </select>
    <label>Current Amount</label>
    <input id="edit-fc-amount" type="number" value="${fc.amount}">
    <label>Notes</label>
    <input id="edit-fc-notes" value="${escapeHtml(fc.notes || '')}">
    <button class="btn btn-primary" style="margin-bottom:10px;" onclick="submitEditFixedCharge(${id})">Save Changes</button>
    <button class="btn btn-danger" onclick="submitDeleteFixedCharge(${id})">Delete</button>
  `);
}

async function submitEditFixedCharge(id) {
  const label = document.getElementById('edit-fc-label').value.trim();
  const category = document.getElementById('edit-fc-category').value;
  const amount = parseInt(document.getElementById('edit-fc-amount').value, 10);
  const notes = document.getElementById('edit-fc-notes').value.trim();

  try {
    await api(`/fixed-charges/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ label, category, amount, notes }),
    });
    closeModal();
    showToast('Updated.', 'success');
    loadSettings();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function submitDeleteFixedCharge(id) {
  try {
    await api(`/fixed-charges/${id}`, { method: 'DELETE' });
    closeModal();
    showToast('Deleted.', 'success');
    loadSettings();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// Turns a fixed-charge reference rate into a real, dated expense entry with one tap.
async function quickLogFixedCharge(id) {
  let charges;
  try {
    charges = await api('/fixed-charges');
  } catch (e) {
    showToast(e.message, 'error');
    return;
  }
  const fc = charges.find(c => c.id === id);
  if (!fc) return;

  try {
    await api('/expenses', {
      method: 'POST',
      body: JSON.stringify({
        category: fc.category,
        amount: fc.amount,
        description: fc.label,
        expense_date: new Date().toISOString().slice(0, 10),
      }),
    });
    showToast(`Logged ${fmtMoney(fc.amount)} for ${fc.label}.`, 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ---- Corrections review (admin / pg_manager) ----

async function openResolveCorrectionModal(correctionId, recordType, recordId) {
  let record;
  try {
    if (recordType === 'payment') {
      const payments = await api('/payments?limit=200');
      record = payments.find(p => p.id === recordId);
    } else {
      const exp = await api('/expenses');
      record = exp.rows.find(e => e.id === recordId);
    }
  } catch (e) {
    showToast(e.message, 'error');
  }

  openModal(`
    <div class="modal-header">
      <div class="modal-title">Review Flag</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    ${record ? `
      <div class="card" style="margin-bottom:14px;">
        <div class="list-row"><div class="list-row-main"><div class="list-row-sub">Current Amount</div></div><div>${fmtMoney(record.amount)}</div></div>
        ${record.resident_name ? `<div class="list-row"><div class="list-row-main"><div class="list-row-sub">Resident</div></div><div>${escapeHtml(record.resident_name)}</div></div>` : ''}
        ${record.payment_type ? `<div class="list-row"><div class="list-row-main"><div class="list-row-sub">Payment type</div></div><div>${escapeHtml(record.payment_type)}</div></div>` : ''}
        ${record.category ? `<div class="list-row"><div class="list-row-main"><div class="list-row-sub">Category</div></div><div>${escapeHtml(record.category)}</div></div>` : ''}
      </div>

      <label>What needs fixing?</label>
      <select id="resolve-fix-type" onchange="toggleResolveFix()">
        <option value="">Select…</option>
        ${recordType === 'payment' ? `
          <option value="fix_type">Wrong payment type (e.g. advance entered as rent)</option>
        ` : ''}
        <option value="fix_amount">Wrong amount (change or set to zero if no money was received)</option>
        <option value="remove">Payment was entered by mistake — remove entirely</option>
      </select>

      <div id="resolve-fix-type-section" style="display:none;margin-top:10px;">
        <label>Correct payment type</label>
        <select id="resolve-new-type">
          <option value="rent">Rent</option>
          <option value="advance">Advance</option>
          <option value="refund">Refund</option>
        </select>
      </div>

      <div id="resolve-fix-amount-section" style="display:none;margin-top:10px;">
        <label>Correct amount <span style="font-weight:400;color:var(--ink-soft);">(enter 0 if no payment was actually received)</span></label>
        <input id="resolve-amount" type="number" min="0" placeholder="0" value="${record.amount}">
      </div>

      <label style="margin-top:12px;">Reason / remarks <span style="color:var(--red);font-size:11px;">* required</span></label>
      <input id="resolve-note" placeholder="e.g. Sakti paid advance only, not rent — entry error">

      <button class="btn btn-primary" style="margin-top:12px;margin-bottom:10px;" onclick="submitFixAndResolve(${correctionId}, '${recordType}', ${recordId})">Save Fix &amp; Resolve Flag</button>
    ` : `<p style="color:var(--ink-soft);margin-bottom:14px;">Original record couldn't be loaded — you can still dismiss this flag below.</p>`}
    <button class="btn btn-outline" onclick="submitDismissCorrection(${correctionId})">Dismiss Flag (no change needed)</button>
  `);
}

function toggleResolveFix() {
  const fixType = document.getElementById('resolve-fix-type').value;
  document.getElementById('resolve-fix-type-section').style.display = fixType === 'fix_type' ? 'block' : 'none';
  document.getElementById('resolve-fix-amount-section').style.display = fixType === 'fix_amount' ? 'block' : 'none';
}

async function submitFixAndResolve(correctionId, recordType, recordId) {
  const fixType = document.getElementById('resolve-fix-type').value;
  const note = document.getElementById('resolve-note')?.value?.trim() || '';

  if (!fixType) { showToast('Please select what needs fixing.', 'error'); return; }
  if (!note) { showToast('A reason is required before saving.', 'error'); return; }

  const body = { status: 'resolved', resolution_note: note, fix_type: fixType };

  if (fixType === 'fix_type') {
    body.new_payment_type = document.getElementById('resolve-new-type').value;
  } else if (fixType === 'fix_amount') {
    const amt = parseInt(document.getElementById('resolve-amount').value, 10);
    if (isNaN(amt) || amt < 0) { showToast('Enter 0 or a positive amount.', 'error'); return; }
    body.new_amount = amt;
  }
  // fix_type === 'remove' needs no extra fields — note is mandatory above

  try {
    await api(`/corrections/${correctionId}`, { method: 'PATCH', body: JSON.stringify(body) });
    closeModal();
    showToast('Fixed and resolved.', 'success');
    loadSettings();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function submitDismissCorrection(correctionId) {
  try {
    await api(`/corrections/${correctionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'dismissed' }),
    });
    closeModal();
    showToast('Flag dismissed.', 'success');
    loadSettings();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ---- Property Page Editor ----

const DEFAULT_AMENITIES = ['Wi-Fi','CCTV Security','Power backup','RO water','Geyser','Lift','Washing machine','Dining area','Working space','24/7 Security','Parking','Housekeeping'];
const DEFAULT_RULES = [
  'Rent to be paid on time — before the 5th of every month.',
  'Vacating person must inform one month in advance. Advance will not be refunded without prior notice.',
  'Strictly no smoking and no alcohol on the premises.',
  'No outsiders allowed inside. Violation leads to immediate eviction.',
  'Maintain cleanliness of your room and all common areas.',
  'Rent and advance must be paid only to the management number. Payment to any other person is not acceptable.',
  'All residents must follow house rules and cooperate for a peaceful environment.',
  'Any damage to property or furniture is chargeable to the responsible resident.',
  'A copy of a valid government ID (Aadhaar/Passport) must be submitted before move-in. No check-in without ID proof.',
  'Management decision is final in all matters.',
];

async function openPropertyPageEditor(pgId) {
  const pg = state.pgList.find(p => p.id === pgId);
  if (!pg) return;

  let amenities = pg.amenities ? JSON.parse(pg.amenities) : DEFAULT_AMENITIES.slice(0, 8);
  let rules = pg.house_rules ? JSON.parse(pg.house_rules) : DEFAULT_RULES;
  let photos = pg.photos ? JSON.parse(pg.photos) : [];
  const enabled = pg.property_page_enabled || 0;
  const pageUrl = `${location.origin}/property.html?pg=${pgId}`;

  openModal(`
    <div class="modal-header">
      <div class="modal-title">Property page — ${escapeHtml(pg.name)}</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>

    ${enabled ? `
      <div style="background:var(--green-soft,#e6f4ec);border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:12px;">
        <div style="font-weight:600;color:var(--green,#2F7A4F);margin-bottom:4px;">Page is live</div>
        <div style="word-break:break-all;color:var(--ink-soft);font-size:11px;">${pageUrl}</div>
        <button class="btn btn-sm" style="margin-top:6px;font-size:11px;" onclick="navigator.clipboard.writeText('${pageUrl}').then(()=>showToast('Link copied!','success'))">Copy link</button>
        <button class="btn btn-sm" style="margin-top:6px;font-size:11px;margin-left:4px;" onclick="window.open('${pageUrl}','_blank')">Preview</button>
      </div>` : `
      <div style="background:var(--surface-1,#f5f5f3);border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:12px;color:var(--ink-soft);">
        Page is not published yet. Fill in details below and publish to get a shareable link.
      </div>`}

    <label>Tagline (short description)</label>
    <input id="pp-tagline" placeholder="Premium co-living for students &amp; professionals" value="${escapeHtml(pg.tagline || '')}">

    <label>About this PG</label>
    <textarea id="pp-desc" rows="3" placeholder="Describe the property, location, neighbourhood…">${escapeHtml(pg.description || '')}</textarea>

    <label style="margin-top:12px;">Pricing</label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:4px;">
      <div>
        <div style="font-size:11px;color:var(--ink-soft);margin-bottom:3px;">Single — Monthly rent</div>
        <input id="pp-s-rent" type="number" placeholder="24000" value="${pg.single_rent || ''}">
      </div>
      <div>
        <div style="font-size:11px;color:var(--ink-soft);margin-bottom:3px;">Single — Advance</div>
        <input id="pp-s-adv" type="number" placeholder="20000" value="${pg.single_advance || ''}">
      </div>
      <div>
        <div style="font-size:11px;color:var(--ink-soft);margin-bottom:3px;">Double — Monthly rent</div>
        <input id="pp-d-rent" type="number" placeholder="12000" value="${pg.double_rent || ''}">
      </div>
      <div>
        <div style="font-size:11px;color:var(--ink-soft);margin-bottom:3px;">Double — Advance</div>
        <input id="pp-d-adv" type="number" placeholder="7000" value="${pg.double_advance || ''}">
      </div>
    </div>

    <label>Amenities <span style="font-weight:400;color:var(--ink-soft);">(tick what applies)</span></label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:4px;" id="pp-amenity-grid">
      ${DEFAULT_AMENITIES.map(a => `
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:400;margin:0;padding:6px 0;cursor:pointer;">
          <input type="checkbox" value="${a}" ${amenities.includes(a) ? 'checked' : ''} style="width:auto;margin:0;"> ${a}
        </label>`).join('')}
    </div>

    <label>House rules <span style="font-weight:400;color:var(--ink-soft);">(edit or leave as default)</span></label>
    <textarea id="pp-rules" rows="6" placeholder="One rule per line">${rules.join('\n')}</textarea>

    <label>Photos <span style="font-weight:400;color:var(--ink-soft);">(upload up to 6)</span></label>
    <input type="file" id="pp-photo-input" accept="image/*" multiple style="margin-bottom:6px;">
    <div id="pp-photo-previews" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px;">
      ${photos.map((p,i) => `<div style="position:relative;"><img src="${p}" style="width:70px;height:55px;object-fit:cover;border-radius:6px;border:1px solid var(--border);"><button onclick="removePpPhoto(${i})" style="position:absolute;top:-4px;right:-4px;background:var(--red,#B23B3B);color:#fff;border:none;border-radius:50%;width:16px;height:16px;font-size:10px;cursor:pointer;line-height:1;">✕</button></div>`).join('')}
    </div>

    <div style="display:flex;gap:8px;margin-top:16px;">
      <button class="btn btn-primary" style="flex:1;" onclick="savePropertyPage(${pgId}, true)">
        ${enabled ? 'Save changes' : 'Publish page'}
      </button>
      ${enabled ? `<button class="btn" onclick="savePropertyPage(${pgId}, false)" style="font-size:12px;">Unpublish</button>` : ''}
    </div>
  `);

  // Wire photo upload
  window._ppPhotos = photos.slice();
  document.getElementById('pp-photo-input').addEventListener('change', async (e) => {
    for (const file of Array.from(e.target.files)) {
      if (window._ppPhotos.length >= 6) { showToast('Maximum 6 photos allowed', 'error'); break; }
      const dataUrl = await compressImage(file, 800, 0.75);
      window._ppPhotos.push(dataUrl);
    }
    refreshPpPreviews();
  });
}

window.removePpPhoto = function(idx) {
  window._ppPhotos.splice(idx, 1);
  refreshPpPreviews();
};

function refreshPpPreviews() {
  const el = document.getElementById('pp-photo-previews');
  if (!el) return;
  el.innerHTML = window._ppPhotos.map((p,i) =>
    `<div style="position:relative;"><img src="${p}" style="width:70px;height:55px;object-fit:cover;border-radius:6px;border:1px solid var(--border);"><button onclick="removePpPhoto(${i})" style="position:absolute;top:-4px;right:-4px;background:#B23B3B;color:#fff;border:none;border-radius:50%;width:16px;height:16px;font-size:10px;cursor:pointer;line-height:1;">✕</button></div>`
  ).join('');
}

async function savePropertyPage(pgId, publish) {
  const tagline = document.getElementById('pp-tagline').value.trim();
  const description = document.getElementById('pp-desc').value.trim();
  const sRent = parseInt(document.getElementById('pp-s-rent').value, 10) || null;
  const sAdv = parseInt(document.getElementById('pp-s-adv').value, 10) || null;
  const dRent = parseInt(document.getElementById('pp-d-rent').value, 10) || null;
  const dAdv = parseInt(document.getElementById('pp-d-adv').value, 10) || null;

  const checkedAmenities = Array.from(
    document.querySelectorAll('#pp-amenity-grid input[type=checkbox]:checked')
  ).map(cb => cb.value);

  const rulesText = document.getElementById('pp-rules').value.trim();
  const rules = rulesText.split('\n').map(r => r.trim()).filter(Boolean);

  try {
    await api(`/pgs/${pgId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        tagline, description,
        single_rent: sRent, single_advance: sAdv,
        double_rent: dRent, double_advance: dAdv,
        amenities: checkedAmenities,
        house_rules: rules,
        photos: window._ppPhotos || [],
        property_page_enabled: publish ? 1 : 0,
      }),
    });
    // Refresh pg list in state
    state.pgList = await api('/pgs');
    closeModal();
    if (publish) {
      const pageUrl = `${location.origin}/property.html?pg=${pgId}`;
      showToast('Page published! Tap to copy link.', 'success');
      navigator.clipboard.writeText(pageUrl).catch(() => {});
    } else {
      showToast('Page unpublished.', 'success');
    }
    loadSettings();
  } catch (e) {
    showToast(e.message, 'error');
  }
}
