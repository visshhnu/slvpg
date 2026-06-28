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
        <div class="list-row" onclick="openEditPgModal(${pg.id})" style="cursor:pointer;">
          <div class="list-row-main">
            <div class="list-row-title">${escapeHtml(pg.name)}</div>
            <div class="list-row-sub">${pg.landlord_name ? 'Landlord: ' + escapeHtml(pg.landlord_name) : 'No landlord set'}</div>
          </div>
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

async function submitAddStaff() {
  const name = document.getElementById('staff-name').value.trim();
  const phone = document.getElementById('staff-phone').value.trim();
  const pg_id = parseInt(document.getElementById('staff-pg').value, 10);
  const username = document.getElementById('staff-username').value.trim();
  const password = document.getElementById('staff-password').value;

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
      body: JSON.stringify({ name, phone, username, password, pg_id }),
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

// ---- Corrections review (admin) ----

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
        ${record.category ? `<div class="list-row"><div class="list-row-main"><div class="list-row-sub">Category</div></div><div>${escapeHtml(record.category)}</div></div>` : ''}
      </div>
      <label>Fix the Amount</label>
      <input id="resolve-amount" type="number" value="${record.amount}">
      <button class="btn btn-primary" style="margin-bottom:10px;" onclick="submitFixAndResolve(${correctionId}, '${recordType}', ${recordId})">Save Fix &amp; Resolve Flag</button>
    ` : `<p style="color:var(--ink-soft);margin-bottom:14px;">Original record couldn't be loaded — you can still dismiss this flag below.</p>`}
    <button class="btn btn-outline" onclick="submitDismissCorrection(${correctionId})">Dismiss Flag (no change needed)</button>
  `);
}

async function submitFixAndResolve(correctionId, recordType, recordId) {
  const amount = parseInt(document.getElementById('resolve-amount').value, 10);
  if (!amount || amount <= 0) {
    showToast('Enter a valid amount.', 'error');
    return;
  }
  try {
    const endpoint = recordType === 'payment' ? `/payments/${recordId}` : `/expenses/${recordId}`;
    await api(endpoint, { method: 'PATCH', body: JSON.stringify({ amount }) });
    await api(`/corrections/${correctionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'resolved', resolution_note: `Amount corrected to ${amount}` }),
    });
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
