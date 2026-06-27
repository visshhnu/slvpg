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
        <div class="stat-box"><div class="stat-num" style="font-size:16px;">${room.sharing_type === 'single' ? 'Single' : 'Double'}</div><div class="stat-label">Sharing</div></div>
        <div class="stat-box"><div class="stat-num" style="font-size:16px;">${fmtMoney(room.monthly_rent)}</div><div class="stat-label">Rent/bed</div></div>
        <div class="stat-box"><div class="stat-num" style="font-size:16px;">${fmtMoney(room.refundable_amount)}</div><div class="stat-label">Refundable</div></div>
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
    <div class="card">
      ${fullDetail.facilities.map(f => `
        <div class="list-row">
          <div class="list-row-main">
            <div class="list-row-title">${escapeHtml(f.item_name)} <span style="color:var(--ink-soft);font-weight:500;">×${f.quantity}</span></div>
          </div>
          <select onchange="updateFacilityCondition(${f.id}, this.value)" style="width:auto;margin:0;padding:6px 8px;font-size:12px;">
            <option value="good" ${f.condition === 'good' ? 'selected' : ''}>Good</option>
            <option value="damaged" ${f.condition === 'damaged' ? 'selected' : ''}>Damaged</option>
            <option value="missing" ${f.condition === 'missing' ? 'selected' : ''}>Missing</option>
          </select>
        </div>
      `).join('')}
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

async function updateFacilityCondition(facilityId, condition) {
  try {
    await api(`/room-facilities/${facilityId}`, { method: 'PATCH', body: JSON.stringify({ condition }) });
    showToast('Updated.', 'success');
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

  try {
    await api('/rooms', {
      method: 'POST',
      body: JSON.stringify({
        floor, room_number, sharing_type,
        capacity: sharing_type === 'single' ? 1 : 2,
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
