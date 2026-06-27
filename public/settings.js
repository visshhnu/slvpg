// ===== Settings screen =====

async function loadSettings() {
  const el = document.getElementById('screen-settings');
  el.innerHTML = `<div class="card"><div class="empty-state">Loading…</div></div>`;

  if (state.staff.role !== 'owner') {
    el.innerHTML = `
      <div class="card">
        <div class="card-title">Logged in as</div>
        <div class="list-row"><div class="list-row-main"><div class="list-row-title">${escapeHtml(state.staff.name)}</div><div class="list-row-sub">Staff account</div></div></div>
      </div>
      <div class="card">
        <div class="empty-state">
          <div class="empty-state-title">Staff management</div>
          <div>Only the owner account can add or remove staff logins.</div>
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
      <div class="list-row"><div class="list-row-main"><div class="list-row-title">${escapeHtml(state.staff.name)}</div><div class="list-row-sub">Owner</div></div></div>
    </div>

    <div class="card">
      <div class="card-title">Staff &amp; Warden Logins</div>
      ${staffList.length === 0 ? `<div class="empty-state">No other staff added yet.</div>` :
        staffList.map(s => `
          <div class="list-row">
            <div class="list-row-main">
              <div class="list-row-title">${escapeHtml(s.name)}</div>
              <div class="list-row-sub">@${escapeHtml(s.username)} · ${s.phone ? escapeHtml(s.phone) : 'no phone'}</div>
            </div>
            <span class="badge ${s.role === 'owner' ? 'badge-gold' : 'badge-gray'}">${s.role}</span>
          </div>
        `).join('')
      }
    </div>
    <p style="font-size:12.5px;color:var(--ink-soft);text-align:center;">Tap + to add a new staff or warden login.</p>
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
  const username = document.getElementById('staff-username').value.trim();
  const password = document.getElementById('staff-password').value;

  if (!name || !username || !password) {
    showToast('Name, username and password are required.', 'error');
    return;
  }
  if (password.length < 6) {
    showToast('Password must be at least 6 characters.', 'error');
    return;
  }

  try {
    await api('/staff', {
      method: 'POST',
      body: JSON.stringify({ name, phone, username, password, role: 'staff' }),
    });
    closeModal();
    showToast('Staff login created.', 'success');
    loadSettings();
  } catch (e) {
    showToast(e.message, 'error');
  }
}
