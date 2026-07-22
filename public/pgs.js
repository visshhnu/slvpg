// ===== PG switcher (admin) =====

function openPgSwitcher() {
  // Nothing to switch for a single-PG staff account. canSwitchPg() (app.js)
  // is true for admin, or a staff/pg_manager assigned to more than one PG.
  if (!canSwitchPg()) return;

  openModal(`
    <div class="modal-header">
      <div class="modal-title">Switch Property</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="card" style="margin-bottom:14px;">
      ${state.pgList.map(pg => `
        <div class="list-row" style="cursor:pointer;" onclick="selectPg(${pg.id})">
          <div class="list-row-main">
            <div class="list-row-title">${escapeHtml(pg.name)}</div>
            <div class="list-row-sub">${pg.address ? escapeHtml(pg.address.slice(0, 50)) + '…' : 'No address set'}</div>
          </div>
          ${pg.id === state.currentPgId ? `<span class="badge badge-green">Viewing</span>` : ''}
        </div>
      `).join('')}
    </div>
    ${state.staff.role === 'admin' ? `<button class="btn btn-outline" onclick="openAddPgModal()">+ Add Another PG</button>` : ''}
  `);
}

async function selectPg(pgId) {
  state.currentPgId = pgId;
  // Every per-PG cache must be dropped here, not just currentPgId -- without
  // this, an admin switching properties would keep seeing the PREVIOUS PG's
  // room layout (state.rooms), resident list or rent data until something
  // else happened to refetch them. state.rooms in particular now backs the
  // Rent tab's Room view, so a stale cache there would show the wrong
  // property's floors/rooms/vacant beds after switching.
  state.rooms = [];
  state.residents = [];
  state.rentData = null;
  state.expensesData = null;
  updatePgLabel();
  closeModal();
  switchTab(state.currentTab); // reload current screen with new PG's data
}

function openAddPgModal() {
  openModal(`
    <div class="modal-header">
      <div class="modal-title">Add a New PG</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <label>PG Name</label>
    <input id="pg-name" placeholder="e.g. Sri Lakshmi Venkateshwara Annex 2">
    <label>Address</label>
    <input id="pg-address" placeholder="Full address">
    <label>Contact Phone</label>
    <input id="pg-phone" placeholder="For booking enquiries">
    <label>Landlord Name (optional)</label>
    <input id="pg-landlord-name" placeholder="Who you pay rent to">
    <label>Landlord Phone (optional)</label>
    <input id="pg-landlord-phone" placeholder="Landlord's contact">
    <button class="btn btn-primary" onclick="submitAddPg()">Create PG</button>
    <p style="font-size:12px;color:var(--ink-soft);text-align:center;margin-top:10px;">You can add rooms to it right after, from the Rooms tab.</p>
  `);
}

async function submitAddPg() {
  const name = document.getElementById('pg-name').value.trim();
  const address = document.getElementById('pg-address').value.trim();
  const contact_phone = document.getElementById('pg-phone').value.trim();
  const landlord_name = document.getElementById('pg-landlord-name').value.trim();
  const landlord_phone = document.getElementById('pg-landlord-phone').value.trim();

  if (!name) {
    showToast('PG name is required.', 'error');
    return;
  }

  try {
    const result = await api('/pgs', {
      method: 'POST',
      body: JSON.stringify({ name, address, contact_phone, landlord_name, landlord_phone }),
    });
    state.pgList = await api('/pgs');
    state.currentPgId = result.id;
    updatePgLabel();
    closeModal();
    showToast('PG created. Now add its rooms from the Rooms tab.', 'success');
    switchTab('rooms');
  } catch (e) {
    showToast(e.message, 'error');
  }
}
