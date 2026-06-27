// ===== Settings screen =====

async function loadSettings() {
  const el = document.getElementById('screen-settings');
  el.innerHTML = `<div class="card"><div class="empty-state">Loading…</div></div>`;

  if (state.staff.role !== 'admin') {
    el.innerHTML = `
      <div class="card">
        <div class="card-title">Logged in as</div>
        <div class="list-row"><div class="list-row-main"><div class="list-row-title">${escapeHtml(state.staff.name)}</div><div class="list-row-sub">Staff account</div></div></div>
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
    const staffList = await api('/staff');
    renderSettings(staffList);
  } catch (e) {
    el.innerHTML = `<div class="card"><div class="empty-state-title">Couldn't load staff list</div><div>${e.message}</div></div>`;
  }
}

function renderSettings(staffList) {
  const el = document.getElementById('screen-settings');
  el.innerHTML = `
    <div class="card">
      <div class="card-title">Logged in as</div>
      <div class="list-row"><div class="list-row-main"><div class="list-row-title">${escapeHtml(state.staff.name)}</div><div class="list-row-sub">Admin · sees all PGs</div></div></div>
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
