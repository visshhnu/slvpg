// ===== Rooms screen =====

async function loadRooms() {
  const el = document.getElementById('screen-rooms');
  el.innerHTML = `<div class="card"><div class="empty-state">Loading…</div></div>`;
  if (!state.currentPgId) {
    el.innerHTML = `<div class="card"><div class="empty-state"><div class="empty-state-title">No PG selected</div></div></div>`;
    return;
  }
  try {
    state.rooms = await api('/rooms');
    renderRooms();
  } catch (e) {
    el.innerHTML = `<div class="card"><div class="empty-state-title">Couldn't load rooms</div><div>${e.message}</div></div>`;
  }
}

function renderRooms() {
  const el = document.getElementById('screen-rooms');
  const floors = [...new Set(state.rooms.map(r => r.floor))];

  if (state.rooms.length === 0) {
    el.innerHTML = `<div class="card"><div class="empty-state">
      <div class="empty-state-title">No rooms yet</div>
      <div>Tap the + button to add your first room.</div>
    </div></div>`;
    return;
  }

  el.innerHTML = floors.map(floor => {
    const floorRooms = state.rooms.filter(r => r.floor === floor);
    return `
      <div class="floor-group">
        <div class="floor-label">${floor} Floor</div>
        <div class="room-grid">
          ${floorRooms.map(room => {
            const occCount = room.beds.filter(b => b.occupied).length;
            const cls = occCount === room.capacity ? 'full' : occCount === 0 ? 'empty' : 'partial';
            return `
              <div class="room-card ${cls}" onclick="openRoomDetail(${room.id})">
                ${room.needs_maintenance ? '<div class="maint-dot"></div>' : ''}
                <div class="room-num">${escapeHtml(room.room_number)}</div>
                <div class="room-occ">${occCount}/${room.capacity}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');
}

async function openRoomDetail(roomId) {
  const room = state.rooms.find(r => r.id === roomId);
  if (!room) return;

  let fullDetail;
  try {
    fullDetail = await api(`/rooms/${roomId}`);
  } catch (e) {
    showToast(e.message, 'error');
    return;
  }

  openModal(`
    <div class="modal-header">
      <div class="modal-title">${room.floor} · ${escapeHtml(room.room_number)}</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="card" style="margin-bottom:14px;">
      <div class="row-3">
        <div class="stat-box"><div class="stat-num" style="font-size:16px;">${sharingLabel(room.sharing_type, room.capacity)}</div><div class="stat-label">Sharing</div></div>
        <div class="stat-box"><div class="stat-num" style="font-size:16px;">${fmtMoney(room.monthly_rent)}</div><div class="stat-label">Rent/bed</div></div>
        <div class="stat-box"><div class="stat-num" style="font-size:16px;">${fmtMoney(room.refundable_amount)}</div><div class="stat-label">Refundable</div></div>
      </div>
      <button class="btn btn-outline btn-sm" style="margin-top:12px; width:100%;" onclick="openEditRoomModal(${room.id})">Edit Rent / Sharing Type</button>
    </div>
    </div>

    <div class="card" style="margin-bottom:14px; ${room.needs_maintenance ? 'border-color:var(--red);' : ''}">
      <div class="list-row" style="border:none; padding:0 0 8px;">
        <div class="list-row-main"><div class="list-row-title">Needs Maintenance</div></div>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
          <input type="checkbox" id="maint-toggle" ${room.needs_maintenance ? 'checked' : ''} onchange="toggleMaintenance(${roomId}, this.checked)" style="width:auto;margin:0;">
        </label>
      </div>
      ${room.needs_maintenance ? `<input id="maint-note" placeholder="What needs fixing?" value="${escapeHtml(room.maintenance_note || '')}" onblur="saveMaintNote(${roomId}, this.value)">` : ''}
    </div>

    ${room.beds.map(bed => `
      <div class="card" style="margin-bottom:10px;">
        <div class="list-row" style="border:none;padding:0;">
          <div class="list-row-main">
            <div class="list-row-title">Bed ${bed.label}</div>
            ${bed.occupied
              ? `<div class="list-row-sub">${escapeHtml(bed.resident.name)} · ${escapeHtml(bed.resident.phone)}</div>`
              : `<div class="list-row-sub">Vacant</div>`}
          </div>
          ${bed.occupied
            ? `<span class="badge ${bed.resident.status === 'notice_given' ? 'badge-amber' : 'badge-green'}">${bed.resident.status === 'notice_given' ? 'Notice given' : 'Occupied'}</span>`
            : `<button class="btn btn-gold btn-sm" onclick="closeModal(); openAddResidentModal(${bed.id})">Assign</button>`}
        </div>
      </div>
    `).join('')}

    <div class="card-title" style="margin-top:6px;">Room Facilities Checklist</div>
    <div style="background:var(--card);border-radius:var(--radius);border:1px solid var(--border);overflow:hidden;">
      <div style="display:grid;grid-template-columns:1fr auto auto;background:var(--cream);padding:8px 12px;border-bottom:1px solid var(--border);font-size:10px;font-weight:700;letter-spacing:.05em;color:var(--ink-soft);">
        <span>ITEM</span><span style="text-align:center;padding:0 8px;">QTY</span><span style="text-align:right;min-width:120px;">CONDITION</span>
      </div>
      ${fullDetail.facilities.map(f => {
        const condColor = f.condition === 'good' ? 'var(--green)' : f.condition === 'damaged' ? 'var(--amber)' : f.condition === 'missing' ? 'var(--red)' : f.condition === 'not_available' ? 'var(--ink-soft)' : 'var(--ink-soft)';
        return `
        <div style="display:grid;grid-template-columns:1fr auto auto;align-items:center;padding:10px 12px;border-bottom:1px solid var(--border);" id="frow-${f.id}">
          <div>
            <div style="font-size:13px;font-weight:500;">${escapeHtml(f.item_name)}</div>
            ${f.notes ? `<div style="font-size:11px;color:var(--ink-soft);margin-top:2px;">${escapeHtml(f.notes)}</div>` : ''}
          </div>
          <div style="padding:0 8px;">
            <input type="number" min="0" max="10" value="${f.quantity}"
              style="width:44px;text-align:center;padding:5px 4px;font-size:13px;margin:0;border-radius:6px;"
              onchange="updateFacilityField(${f.id}, 'quantity', parseInt(this.value)||0)"
              title="Tap to change quantity">
          </div>
          <div style="min-width:120px;text-align:right;">
            <select onchange="updateFacilityField(${f.id}, 'condition', this.value)"
              style="width:auto;margin:0;padding:5px 6px;font-size:12px;border-radius:6px;font-weight:500;color:${condColor};">
              <option value="good"         ${f.condition==='good'||!f.condition?'selected':''}>Good</option>
              <option value="damaged"      ${f.condition==='damaged'?'selected':''}>Damaged</option>
              <option value="missing"      ${f.condition==='missing'?'selected':''}>Missing</option>
              <option value="not_available"${f.condition==='not_available'?'selected':''}>Not available</option>
            </select>
          </div>
        </div>
        <div style="padding:4px 12px 8px;border-bottom:1px solid var(--border);">
          <input placeholder="Add note (e.g. torn, needs replacement)…"
            value="${escapeHtml(f.notes||'')}"
            style="font-size:11px;padding:5px 8px;border-radius:6px;color:var(--ink-soft);width:100%;margin:0;"
            onchange="updateFacilityField(${f.id}, 'notes', this.value)">
        </div>`;
      }).join('')}
      <div style="padding:10px 12px;">
        <button class="btn btn-outline btn-sm" style="width:100%;font-size:12px;" onclick="openAddFacilityItem(${room.id})">+ Add item</button>
      </div>
    </div>
  `);
}

async function toggleMaintenance(roomId, checked) {
  try {
    await api(`/rooms/${roomId}`, { method: 'PATCH', body: JSON.stringify({ needs_maintenance: checked }) });
    showToast(checked ? 'Marked for maintenance.' : 'Maintenance cleared.', 'success');
    state.rooms = await api('/rooms');
    closeModal();
    renderRooms();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function saveMaintNote(roomId, note) {
  try {
    await api(`/rooms/${roomId}`, { method: 'PATCH', body: JSON.stringify({ maintenance_note: note }) });
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function updateFacilityField(facilityId, field, value) {
  try {
    await api(`/room-facilities/${facilityId}`, {
      method: 'PATCH',
      body: JSON.stringify({ [field]: value }),
    });
    // Subtle feedback — no toast for every keystroke, just color update on condition
    if (field === 'condition') {
      const colors = { good: 'var(--green)', damaged: 'var(--amber)', missing: 'var(--red)', not_available: 'var(--ink-soft)' };
      const sel = document.querySelector(`#frow-${facilityId} select`);
      if (sel) sel.style.color = colors[value] || 'var(--ink)';
      showToast('Updated.', 'success');
    }
  } catch(e) {
    showToast(e.message, 'error');
  }
}

async function openAddFacilityItem(roomId) {
  openModal(`
    <div class="modal-header">
      <div class="modal-title">Add facility item</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <label>Item name</label>
    <input id="new-fac-name" placeholder="e.g. Mirror, Curtain, Table lamp">
    <label>Quantity</label>
    <input id="new-fac-qty" type="number" value="1" min="1" max="10">
    <label>Condition</label>
    <select id="new-fac-cond">
      <option value="good">Good</option>
      <option value="damaged">Damaged</option>
      <option value="missing">Missing</option>
      <option value="not_available">Not available</option>
    </select>
    <label>Notes (optional)</label>
    <input id="new-fac-notes" placeholder="Any remarks">
    <button class="btn btn-primary" style="margin-top:14px;width:100%;" onclick="submitAddFacilityItem(${roomId})">Add item</button>
  `);
}

async function submitAddFacilityItem(roomId) {
  const name = document.getElementById('new-fac-name').value.trim();
  const qty = parseInt(document.getElementById('new-fac-qty').value, 10) || 1;
  const condition = document.getElementById('new-fac-cond').value;
  const notes = document.getElementById('new-fac-notes').value.trim();
  if (!name) { showToast('Item name is required.', 'error'); return; }
  try {
    await api(`/room-facilities/${roomId}`, {
      method: 'POST',
      body: JSON.stringify({ item_name: name, quantity: qty, condition, notes: notes || null }),
    });
    closeModal();
    showToast('Item added.', 'success');
    openRoomDetail(roomId);
  } catch(e) { showToast(e.message, 'error'); }
}

function sharingLabel(sharingType, capacity) {
  if (capacity === 1) return 'Single';
  if (capacity === 2) return 'Double';
  if (capacity === 3) return 'Triple';
  return sharingType;
}

async function openEditRoomModal(roomId) {
  let room;
  try {
    room = await api(`/rooms/${roomId}`);
  } catch (e) {
    showToast(e.message, 'error');
    return;
  }

  const occupiedCount = room.beds ? room.beds.filter(b => b.occupied).length : null;

  openModal(`
    <div class="modal-header">
      <div class="modal-title">Edit Room ${escapeHtml(room.room_number)}</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <label>Sharing Type</label>
    <select id="edit-rm-capacity">
      <option value="1" ${room.capacity === 1 ? 'selected' : ''}>Single (1 person)</option>
      <option value="2" ${room.capacity === 2 ? 'selected' : ''}>Double (2 people)</option>
      <option value="3" ${room.capacity === 3 ? 'selected' : ''}>Triple (3 people)</option>
    </select>
    <p style="font-size:12px;color:var(--ink-soft);margin:-8px 0 14px;">
      Changing this adds or removes beds. Reducing sharing only works if the beds being removed are empty.
    </p>
    <label>Monthly Rent (per bed)</label>
    <input id="edit-rm-rent" type="number" value="${room.monthly_rent}">
    <label>Advance Deposit</label>
    <input id="edit-rm-advance" type="number" value="${room.advance_deposit}">
    <label>Refundable Amount</label>
    <input id="edit-rm-refund" type="number" value="${room.refundable_amount}">
    <button class="btn btn-primary" onclick="submitEditRoom(${roomId})">Save Changes</button>
  `);
}

async function submitEditRoom(roomId) {
  const capacity = parseInt(document.getElementById('edit-rm-capacity').value, 10);
  const monthly_rent = parseInt(document.getElementById('edit-rm-rent').value, 10);
  const advance_deposit = parseInt(document.getElementById('edit-rm-advance').value, 10) || 0;
  const refundable_amount = parseInt(document.getElementById('edit-rm-refund').value, 10) || 0;

  if (!monthly_rent) {
    showToast('Enter a valid rent amount.', 'error');
    return;
  }

  try {
    await api(`/rooms/${roomId}`, {
      method: 'PATCH',
      body: JSON.stringify({ capacity, monthly_rent, advance_deposit, refundable_amount }),
    });
    closeModal();
    showToast('Room updated.', 'success');
    state.rooms = await api('/rooms');
    loadRooms();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function openAddRoomModal() {
  openModal(`
    <div class="modal-header">
      <div class="modal-title">Add a Room</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <label>Floor</label>
    <input id="rm-floor" placeholder="e.g. 1st, Ground, 6th">
    <label>Room Number</label>
    <input id="rm-number" placeholder="e.g. 1-6">
    <label>Sharing Type</label>
    <select id="rm-sharing" onchange="onSharingChange()">
      <option value="double">Double Sharing</option>
      <option value="single">Single Sharing</option>
      <option value="triple">Triple Sharing</option>
    </select>
    <div class="row-2">
      <div>
        <label>Monthly Rent (per bed)</label>
        <input id="rm-rent" type="number" placeholder="12000">
      </div>
      <div>
        <label>Advance Deposit</label>
        <input id="rm-advance" type="number" placeholder="7000">
      </div>
    </div>
    <label>Refundable Amount</label>
    <input id="rm-refund" type="number" placeholder="4000">
    <button class="btn btn-primary" onclick="submitAddRoom()">Save Room</button>
    <p style="font-size:12px;color:var(--ink-soft);text-align:center;margin-top:8px;">A standard facilities checklist (bed, mattress, fan, geyser, etc.) is added automatically — edit it from the room's detail screen.</p>
  `);
}

function onSharingChange() {
  const sharing = document.getElementById('rm-sharing').value;
  if (sharing === 'single') {
    document.getElementById('rm-rent').value = 24000;
    document.getElementById('rm-advance').value = 20000;
    document.getElementById('rm-refund').value = 14000;
  } else if (sharing === 'triple') {
    document.getElementById('rm-rent').value = 9000;
    document.getElementById('rm-advance').value = 6000;
    document.getElementById('rm-refund').value = 3000;
  } else {
    document.getElementById('rm-rent').value = 12000;
    document.getElementById('rm-advance').value = 7000;
    document.getElementById('rm-refund').value = 4000;
  }
}

async function submitAddRoom() {
  const floor = document.getElementById('rm-floor').value.trim();
  const room_number = document.getElementById('rm-number').value.trim();
  const sharing_type = document.getElementById('rm-sharing').value;
  const monthly_rent = parseInt(document.getElementById('rm-rent').value, 10);
  const advance_deposit = parseInt(document.getElementById('rm-advance').value, 10) || 0;
  const refundable_amount = parseInt(document.getElementById('rm-refund').value, 10) || 0;

  if (!floor || !room_number || !monthly_rent) {
    showToast('Please fill floor, room number and rent.', 'error');
    return;
  }

  const capacityMap = { single: 1, double: 2, triple: 3 };

  try {
    await api('/rooms', {
      method: 'POST',
      body: JSON.stringify({
        floor, room_number, sharing_type,
        capacity: capacityMap[sharing_type] || 2,
        monthly_rent, advance_deposit, refundable_amount,
      }),
    });
    closeModal();
    showToast('Room added.', 'success');
    loadRooms();
  } catch (e) {
    showToast(e.message, 'error');
  }
}
