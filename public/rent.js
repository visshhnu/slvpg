// ===== Rent screen =====
// Rent is room-first & operationally driven: default view groups by floor
// then room (including vacant beds, so a manager sees the whole floor at a
// glance), with a Resident view toggle for a flat, filterable work queue.

let rentView = 'room'; // 'room' | 'resident'
let rentStatusFilter = 'all'; // filter chips only apply to Resident view

async function loadRent() {
  const el = document.getElementById('screen-rent');
  el.innerHTML = `<div class="card"><div class="empty-state">Loading…</div></div>`;
  if (!state.currentPgId) {
    el.innerHTML = `<div class="card"><div class="empty-state"><div class="empty-state-title">No PG selected</div></div></div>`;
    return;
  }
  try {
    const [rentData] = await Promise.all([
      api(`/rent?month=${state.rentMonth}`),
      state.rooms.length === 0 ? api('/rooms').then(r => { state.rooms = r; }) : Promise.resolve(),
    ]);
    state.rentData = rentData;
    renderRent();
  } catch (e) {
    el.innerHTML = `<div class="card"><div class="empty-state-title">Couldn't load rent data</div><div>${e.message}</div></div>`;
  }
}

function changeRentMonth(delta) {
  const [y, m] = state.rentMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  state.rentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  loadRent();
}

function setRentView(view) { rentView = view; renderRent(); }
function setRentStatusFilter(f) { rentStatusFilter = f; renderRent(); }

function filterRentRows(rows) {
  if (rentStatusFilter === 'all') return rows;
  if (rentStatusFilter === 'advance_pending') {
    return rows.filter(r => r.advance && (r.advance.status === 'pending' || r.advance.status === 'partial'));
  }
  return rows.filter(r => r.status === rentStatusFilter);
}

function renderExceptionsCard(exceptions) {
  if (!exceptions || exceptions.length === 0) return '';
  // Every exception links straight to the resident's Payment History (where
  // Edit/Delete already exist) so a flagged item can actually be acted on
  // from here, not just read -- previously this card was informational only.
  return `
    <div class="exceptions-card">
      <div class="card-title">⚠ Needs attention (${exceptions.length})</div>
      ${exceptions.map(e => e.items.map(item => `
        <div class="exception-row" style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <div style="min-width:0;">
            <div class="exc-label">${escapeHtml(e.resident_name)} — ${escapeHtml(item.label)}</div>
            <div class="exc-detail">${escapeHtml(item.detail)}</div>
          </div>
          <button class="btn btn-sm btn-outline" style="flex-shrink:0;" onclick="openResidentDetail(${e.resident_id})">Review</button>
        </div>
      `).join('')).join('')}
    </div>`;
}

// Room view: every bed on every floor, occupied or not -- billing rows are
// matched onto their bed by floor+room+bed label (same source columns as
// /rooms, so this always lines up).
function renderRoomView(rows) {
  if (!state.rooms || state.rooms.length === 0) {
    return `<div class="card"><div class="empty-state">Room layout not loaded — switch to Resident view, or open the Rooms tab once.</div></div>`;
  }
  const byBed = {};
  rows.forEach(r => { byBed[`${r.floor}|${r.room_number}|${r.bed_label}`] = r; });

  const floors = [...new Set(state.rooms.map(rm => rm.floor))];
  return floors.map(floor => {
    const cardsHtml = state.rooms.filter(rm => rm.floor === floor).map(room =>
      room.beds.map(bed => {
        const row = byBed[`${floor}|${room.room_number}|${bed.label}`];
        return row ? renderRoomRentCard(row, room) : renderVacantBedCard(room, bed);
      }).join('')
    ).join('');
    return `<div class="floor-group"><div class="floor-label">${escapeHtml(floor)} Floor</div>${cardsHtml}</div>`;
  }).join('');
}

function renderVacantBedCard(room, bed) {
  const isReserved = bed.reserved && bed.resident;
  return `
    <div class="card rent-room-card vacant">
      <div class="rrc-head">
        <div>
          <div class="rrc-room">${escapeHtml(room.room_number)}-${escapeHtml(bed.label)}</div>
          <div class="rrc-resident">${isReserved ? `Reserved for ${escapeHtml(bed.resident.name)} · moves in ${fmtDate(bed.resident.join_date)}` : 'No resident assigned'}</div>
        </div>
        <span class="badge ${isReserved ? 'badge-gold' : 'badge-gray'}">${isReserved ? 'Move-in scheduled' : 'Vacant'}</span>
      </div>
    </div>`;
}

// Compact room-first card for Room view: room/bed is the primary heading,
// resident name is secondary -- the inverse emphasis of Resident view's
// renderRentCard, which is person-first. Same underlying figures and the
// same Collect/Part-payment/Advance actions either way.
function renderRoomRentCard(row, room) {
  const notDue = row.status === 'not_due';
  const balance = notDue ? 0 : row.amount_due - row.amount_paid;
  const adv = row.advance;
  const hasExceptions = row.exceptions && row.exceptions.length > 0;

  return `
    <div class="card rent-room-card">
      <div class="rrc-head">
        <div style="min-width:0;">
          <div class="rrc-room">${escapeHtml(room.room_number)}-${escapeHtml(row.bed_label || '')}</div>
          <div class="rrc-resident">${escapeHtml(row.resident_name)}${hasExceptions ? ' <span style="color:var(--red);">⚠</span>' : ''}</div>
        </div>
        <span class="badge ${rentStatusBadgeClass(row.status)}">${rentStatusLabel(row.status)}</span>
      </div>
      <div class="rrc-figures">
        <div><div class="fig-label">Rent</div><div class="fig-val">${notDue ? '—' : `${fmtMoney(row.amount_paid)} / ${fmtMoney(row.amount_due)}`}</div></div>
        ${!notDue ? `<div><div class="fig-label">Due ${fmtDate(row.due_date)}</div><div class="fig-val" style="${balance > 0 ? 'color:var(--red);' : ''}">${fmtMoney(Math.max(0, balance))}</div></div>` : ''}
        ${adv && adv.expected > 0 ? `<div><div class="fig-label">Advance</div><div class="fig-val" style="${adv.balance > 0 ? 'color:var(--amber);' : ''}">${fmtMoney(adv.paid)} / ${fmtMoney(adv.expected)}</div></div>` : ''}
      </div>
      ${row.payments && row.payments.length > 0 ? `<div style="font-size:11px;color:var(--ink-soft);margin-top:6px;">Last: ${fmtMoney(row.payments[row.payments.length - 1].amount)} on ${fmtDate(row.payments[row.payments.length - 1].payment_date)}</div>` : ''}
      ${!notDue && row.status !== 'paid' ? `
        <div style="display:flex;gap:6px;margin-top:8px;">
          <button class="btn btn-primary btn-sm" style="flex:1;" onclick="openCollectModal(${row.id}, ${row.resident_id}, '${escapeHtml(row.resident_name)}', ${balance}, ${row.amount_due})">Collect ${fmtMoney(balance)}</button>
          <button class="btn btn-sm" onclick="openPartPaymentModal(${row.id}, ${row.resident_id}, '${escapeHtml(row.resident_name)}', ${balance}, ${row.amount_due})">Part payment</button>
        </div>` : ''}
      ${adv && adv.balance > 0 ? `
        <button class="btn btn-sm btn-outline" style="margin-top:6px;" onclick="openAdvanceModal(${row.resident_id}, '${escapeHtml(row.resident_name)}', ${adv.balance})">+ Collect advance ${fmtMoney(adv.balance)}</button>` : ''}
    </div>`;
}

// rentStatusBadgeClass/rentStatusLabel now live in app.js (shared with
// residents.js) so both screens use the exact same wording for each status.

function renderRentProgressBar(paid, due, status) {
  const pct = due > 0 ? Math.min(100, Math.round((paid / due) * 100)) : 0;
  const color = status === 'paid' ? 'var(--fill-success)'
    : status === 'overdue' ? 'var(--fill-danger)'
    : status === 'partial' ? 'var(--fill-warning)'
    : 'var(--border-strong)';
  return `
    <div style="display:flex;align-items:center;gap:8px;margin:6px 0 4px;">
      <div style="flex:1;height:5px;background:var(--surface-1);border-radius:99px;overflow:hidden;border:0.5px solid var(--border);">
        <div style="width:${pct}%;height:100%;background:${color};border-radius:99px;"></div>
      </div>
      <span style="font-size:10px;color:var(--text-muted);white-space:nowrap;">${pct}%</span>
    </div>`;
}

function renderPaymentHistory(payments) {
  if (!payments || payments.length === 0) return '';
  const modeLabel = { cash: 'Cash', upi: 'UPI', bank_transfer: 'Bank' };
  const rows = payments.map(p => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;border-bottom:0.5px solid var(--border);">
      <div style="display:flex;align-items:center;gap:6px;">
        <div style="width:6px;height:6px;border-radius:50%;background:var(--fill-success);flex-shrink:0;"></div>
        <span style="font-size:11px;color:var(--text-secondary);">${fmtDate(p.payment_date)}</span>
        <span style="font-size:10px;padding:1px 5px;border-radius:4px;background:var(--surface-1);border:0.5px solid var(--border);color:var(--text-muted);">${modeLabel[p.payment_mode] || p.payment_mode}</span>
        ${p.reference_note ? `<span style="font-size:10px;color:var(--text-muted);max-width:70px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(p.reference_note)}</span>` : ''}
      </div>
      <span style="font-size:12px;font-weight:500;color:var(--text-success);">+${fmtMoney(p.amount)}</span>
    </div>
  `).join('');
  return `
    <div style="border-top:0.5px solid var(--border);margin-top:6px;padding-top:6px;">
      <div style="font-size:10px;color:var(--text-muted);margin-bottom:4px;letter-spacing:.04em;">PAYMENT HISTORY</div>
      ${rows}
    </div>`;
}

function renderAdvanceRow(row) {
  const expected = row.advance_deposit || 0;
  if (expected === 0) return '';
  const adv = advanceState(expected, row.advance_paid || 0);
  const done = adv.balance <= 0;
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;padding-top:8px;border-top:0.5px solid var(--border);">
      <div>
        <div style="font-size:10px;color:var(--text-muted);">${ADVANCE_STATUS_LABELS[adv.status]}</div>
        <div style="font-size:12px;font-weight:500;${done ? 'color:var(--text-success)' : 'color:var(--text-warning)'};">
          ${fmtMoney(adv.paid)} of ${fmtMoney(adv.expected)}
          ${adv.status === 'overpaid' ? ` — overpaid by ${fmtMoney(-adv.balance)} ✓` : done ? ' ✓' : ` — ${fmtMoney(adv.balance)} pending`}
        </div>
      </div>
      ${!done ? `<button class="btn btn-sm" style="font-size:11px;" onclick="openAdvanceModal(${row.resident_id}, '${escapeHtml(row.resident_name)}', ${adv.balance})">+ Add instalment</button>` : ''}
    </div>`;
}

function renderRent() {
  const el = document.getElementById('screen-rent');
  const { summary, rows, exceptions } = state.rentData;
  const filteredRows = rentView === 'resident' ? filterRentRows(rows) : rows;

  const chipDef = [
    { key: 'all', label: 'All', count: rows.length },
    { key: 'overdue', label: 'Overdue', count: rows.filter(r => r.status === 'overdue').length },
    { key: 'partial', label: 'Partial', count: rows.filter(r => r.status === 'partial').length },
    { key: 'pending', label: 'Due', count: rows.filter(r => r.status === 'pending').length },
    { key: 'paid', label: 'Paid', count: rows.filter(r => r.status === 'paid').length },
    { key: 'advance_pending', label: 'Advance pending', count: rows.filter(r => r.advance && (r.advance.status === 'pending' || r.advance.status === 'partial')).length },
  ];

  el.innerHTML = `
    <div class="sticky-summary">
      <div class="month-nav">
        <button onclick="changeRentMonth(-1)">‹</button>
        <div class="month-nav-label">${monthLabel(summary.month)}</div>
        <button onclick="changeRentMonth(1)">›</button>
      </div>
      <div class="card" style="margin-bottom:8px;">
        <div class="stat-grid">
          <div class="stat-box"><div class="stat-num green">${fmtMoney(summary.total_paid)}</div><div class="stat-label">Rent collected</div></div>
          <div class="stat-box"><div class="stat-num red">${fmtMoney(summary.total_pending)}</div><div class="stat-label">Rent pending</div></div>
          <div class="stat-box"><div class="stat-num green">${fmtMoney(summary.advance_total_paid)}</div><div class="stat-label">Advance collected</div></div>
          <div class="stat-box"><div class="stat-num red">${fmtMoney(summary.advance_total_expected - summary.advance_total_paid)}</div><div class="stat-label">Advance pending</div></div>
        </div>
      </div>
      <div class="segmented">
        <button class="${rentView === 'room' ? 'active' : ''}" onclick="setRentView('room')">Room view</button>
        <button class="${rentView === 'resident' ? 'active' : ''}" onclick="setRentView('resident')">Resident view</button>
      </div>
      ${rentView === 'resident' ? `
        <div class="chip-row">
          ${chipDef.map(c => `<button class="chip ${rentStatusFilter === c.key ? 'active' : ''}" onclick="setRentStatusFilter('${c.key}')">${escapeHtml(c.label)}${c.count ? `<span class="chip-count">${c.count}</span>` : ''}</button>`).join('')}
        </div>` : ''}
    </div>

    ${renderExceptionsCard(exceptions)}

    ${rows.length === 0
      ? `<div class="card"><div class="empty-state"><div class="empty-state-title">No residents to bill this month</div></div></div>`
      : filteredRows.length === 0
        ? `<div class="card"><div class="empty-state"><div class="empty-state-title">Nothing matches this filter</div></div></div>`
        : rentView === 'room' ? renderRoomView(filteredRows) : filteredRows.map(row => renderRentCard(row)).join('')
    }
  `;
}

function renderRentCard(row) {
  const notDue = row.status === 'not_due';
  const balance = notDue ? 0 : row.amount_due - row.amount_paid;
  const hasPaidSomething = !notDue && row.amount_paid > 0;
  const isPaid = row.status === 'paid';
  const advExpected = row.advance_deposit || 0;
  const adv = row.advance; // server-computed by functions/_ledger.js -- same figure Room view and Residents tab use
  const totalOutstanding = Math.max(0, balance) + Math.max(0, adv.balance);

  return `
    <div class="card" style="margin-bottom:10px;">

      <!-- Header: name + status -->
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px;">
        <div style="min-width:0;">
          <div style="display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;">
            <span style="font-size:14px;font-weight:600;">${escapeHtml(row.resident_name)}</span>
            ${totalOutstanding > 0
              ? `<span style="font-size:11.5px;font-weight:700;color:var(--text-danger);">${fmtMoney(totalOutstanding)} total due</span>`
              : `<span style="font-size:11.5px;font-weight:600;color:var(--text-success);">All settled ✓</span>`
            }
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">
            ${row.floor || ''} ${row.room_number || ''}${row.bed_label ? '-' + row.bed_label : ''}
            · Joined ${fmtDate(row.join_date)}
            ${notDue ? ' · <em>moves in</em>' : ` · Due ${fmtDate(row.due_date)}`}
          </div>
        </div>
        <span class="badge ${rentStatusBadgeClass(row.status)}">${rentStatusLabel(row.status)}</span>
      </div>

      <!-- Rent row -->
      ${notDue ? `
        <div style="font-size:12px;color:var(--text-muted);padding:6px 0;border-top:1px solid var(--border);">
          Rent will be billed from ${fmtDate(row.join_date)}
        </div>
      ` : `
        <div style="padding:8px 0;border-top:1px solid var(--border);">
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:12.5px;font-weight:600;margin-bottom:4px;">
            <span style="color:var(--text-muted);">RENT</span>
            <span>${isPaid
              ? `<span style="color:var(--text-success);">${fmtMoney(row.amount_due)} paid ✓</span>`
              : `<span style="color:var(--text-danger);">${fmtMoney(balance)} remaining</span> <span style="color:var(--text-muted);font-weight:400;">of ${fmtMoney(row.amount_due)}</span>`
            }</span>
          </div>
          ${renderRentProgressBar(row.amount_paid, row.amount_due, row.status)}
          ${hasPaidSomething ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Paid so far: <strong style="color:var(--text-success);">${fmtMoney(row.amount_paid)}</strong></div>` : ''}
          ${renderPaymentHistory(row.payments)}
          ${!isPaid ? `
            <div style="display:flex;gap:6px;margin-top:8px;">
              <button class="btn btn-primary btn-sm" style="flex:1;" onclick="openCollectModal(${row.id}, ${row.resident_id}, '${escapeHtml(row.resident_name)}', ${balance}, ${row.amount_due})">
                Collect rent ${fmtMoney(balance)}
              </button>
              <button class="btn btn-sm" onclick="openPartPaymentModal(${row.id}, ${row.resident_id}, '${escapeHtml(row.resident_name)}', ${balance}, ${row.amount_due})">
                Part payment
              </button>
            </div>` : ''}
        </div>
      `}

      <!-- Advance row — always visible regardless of rent status -->
      ${advExpected > 0 ? `
        <div style="padding:8px 0;border-top:1px solid var(--border);">
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:12.5px;font-weight:600;margin-bottom:4px;">
            <span style="color:var(--text-muted);">${ADVANCE_STATUS_LABELS[adv.status].toUpperCase()}</span>
            <span>${adv.status === 'overpaid'
              ? `<span style="color:var(--gold,#C99A3E);">${fmtMoney(adv.paid)} paid — overpaid by ${fmtMoney(-adv.balance)}</span>`
              : adv.status === 'paid'
                ? `<span style="color:var(--text-success);">${fmtMoney(adv.paid)} paid ✓</span>`
                : `<span style="color:var(--text-danger);">${fmtMoney(adv.balance)} pending</span> <span style="color:var(--text-muted);font-weight:400;">of ${fmtMoney(adv.expected)}</span>`
            }</span>
          </div>
          ${adv.balance > 0 ? `
            <button class="btn btn-sm" style="margin-top:4px;font-size:11.5px;" onclick="openAdvanceModal(${row.resident_id}, '${escapeHtml(row.resident_name)}', ${adv.balance})">
              + Collect advance instalment
            </button>` : ''}
        </div>
      ` : ''}

    </div>`;
}

// --- Collect full balance ---
function openCollectModal(ledgerId, residentId, name, balance, amountDue) {
  const today = new Date().toISOString().slice(0, 10);
  openModal(`
    <div class="modal-header">
      <div class="modal-title">Collect rent — ${escapeHtml(name)}</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div style="background:var(--surface-1);border-radius:var(--radius);padding:10px 12px;margin-bottom:12px;font-size:13px;">
      <div style="display:flex;justify-content:space-between;"><span style="color:var(--text-muted);">Monthly rent</span><strong>${fmtMoney(amountDue)}</strong></div>
      <div style="display:flex;justify-content:space-between;margin-top:4px;"><span style="color:var(--text-muted);">Already paid</span><strong style="color:var(--text-success);">${fmtMoney(amountDue - balance)}</strong></div>
      <div style="display:flex;justify-content:space-between;margin-top:4px;border-top:0.5px solid var(--border);padding-top:4px;"><span style="color:var(--text-muted);">Balance due</span><strong style="color:var(--text-danger);">${fmtMoney(balance)}</strong></div>
    </div>
    <label>Amount received (₹)</label>
    <input id="pay-amount" type="number" value="${balance}" min="1" max="${balance}">
    <label>Date received</label>
    <input id="pay-date" type="date" value="${today}" max="${today}">
    <label>Payment mode</label>
    <select id="pay-mode">
      <option value="cash">Cash</option>
      <option value="upi">UPI</option>
      <option value="bank_transfer">Bank transfer</option>
    </select>
    <label>Reference / note (optional)</label>
    <input id="pay-note" placeholder="UPI transaction ID, cheque no., etc.">
    <button class="btn btn-primary" style="margin-top:14px;width:100%;" onclick="submitRentPayment(${ledgerId}, ${residentId})">Save payment</button>
  `);
}

// --- Part payment (same modal, empty amount, explicit framing) ---
function openPartPaymentModal(ledgerId, residentId, name, balance, amountDue) {
  const alreadyPaid = amountDue - balance;
  const today = new Date().toISOString().slice(0, 10);
  openModal(`
    <div class="modal-header">
      <div class="modal-title">Part payment — ${escapeHtml(name)}</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div style="background:var(--bg-warning);border-radius:var(--radius);padding:10px 12px;margin-bottom:12px;font-size:12px;color:var(--text-warning);">
      Entering an amount less than the full balance marks this as partial. The remaining balance stays open for the next payment.
    </div>
    <div style="background:var(--surface-1);border-radius:var(--radius);padding:10px 12px;margin-bottom:12px;font-size:13px;">
      <div style="display:flex;justify-content:space-between;"><span style="color:var(--text-muted);">Monthly rent</span><strong>${fmtMoney(amountDue)}</strong></div>
      ${alreadyPaid > 0 ? `<div style="display:flex;justify-content:space-between;margin-top:4px;"><span style="color:var(--text-muted);">Already paid</span><strong style="color:var(--text-success);">${fmtMoney(alreadyPaid)}</strong></div>` : ''}
      <div style="display:flex;justify-content:space-between;margin-top:4px;border-top:0.5px solid var(--border);padding-top:4px;"><span style="color:var(--text-muted);">Balance remaining</span><strong style="color:var(--text-danger);">${fmtMoney(balance)}</strong></div>
    </div>
    <label>Amount received now (₹)</label>
    <input id="pay-amount" type="number" placeholder="Enter amount received" min="1" max="${balance}">
    <div id="pay-after-hint" style="font-size:11px;color:var(--text-muted);margin-top:4px;min-height:16px;"></div>
    <label>Date received</label>
    <input id="pay-date" type="date" value="${today}" max="${today}">
    <label>Payment mode</label>
    <select id="pay-mode">
      <option value="cash">Cash</option>
      <option value="upi">UPI</option>
      <option value="bank_transfer">Bank transfer</option>
    </select>
    <label>Reference / note (optional)</label>
    <input id="pay-note" placeholder="UPI transaction ID, cheque no., etc.">
    <button class="btn btn-primary" style="margin-top:14px;width:100%;" onclick="submitRentPayment(${ledgerId}, ${residentId})">Save payment</button>
  `);
  // Live hint: "after this payment, ₹X will remain"
  setTimeout(() => {
    const inp = document.getElementById('pay-amount');
    const hint = document.getElementById('pay-after-hint');
    if (inp && hint) {
      inp.addEventListener('input', () => {
        const v = parseInt(inp.value, 10) || 0;
        if (v <= 0) { hint.textContent = ''; return; }
        const left = balance - v;
        if (left > 0) hint.innerHTML = `After this: <strong style="color:var(--text-warning);">${fmtMoney(left)} still owed</strong>`;
        else if (left === 0) hint.innerHTML = `<strong style="color:var(--text-success);">This clears the full balance ✓</strong>`;
        else hint.innerHTML = `<span style="color:var(--text-danger);">Amount exceeds balance by ${fmtMoney(-left)}</span>`;
      });
    }
  }, 50);
}

async function submitRentPayment(ledgerId, residentId) {
  const amountInput = document.getElementById('pay-amount');
  const amount = parseInt(amountInput.value, 10);
  const payment_mode = document.getElementById('pay-mode').value;
  const reference_note = document.getElementById('pay-note').value.trim();
  const dateInput = document.getElementById('pay-date');
  const payment_date = dateInput ? dateInput.value : null;

  if (!amount || amount <= 0) {
    showToast('Enter a valid amount.', 'error'); return;
  }
  if (dateInput && !payment_date) {
    showToast('Please pick the date received.', 'error'); return;
  }

  try {
    await api('/payments', {
      method: 'POST',
      body: JSON.stringify({
        resident_id: residentId, rent_ledger_id: ledgerId,
        amount, payment_mode, payment_type: 'rent', reference_note, payment_date,
      }),
    });
    closeModal();
    showToast('Payment recorded.', 'success');
    loadRent();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// --- Advance instalment ---
function openAdvanceModal(residentId, name, balance) {
  const today = new Date().toISOString().slice(0, 10);
  openModal(`
    <div class="modal-header">
      <div class="modal-title">Advance instalment — ${escapeHtml(name)}</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div style="background:var(--surface-1);border-radius:var(--radius);padding:10px 12px;margin-bottom:12px;font-size:13px;">
      <div style="display:flex;justify-content:space-between;"><span style="color:var(--text-muted);">Advance still pending</span><strong style="color:var(--text-warning);">${fmtMoney(balance)}</strong></div>
    </div>
    <label>Amount received now (₹)</label>
    <input id="adv-amount" type="number" placeholder="Enter amount" min="1" max="${balance}">
    <label>Date received</label>
    <input id="adv-date" type="date" value="${today}" max="${today}">
    <label>Payment mode</label>
    <select id="adv-mode">
      <option value="cash">Cash</option>
      <option value="upi">UPI</option>
      <option value="bank_transfer">Bank transfer</option>
    </select>
    <label>Reference / note (optional)</label>
    <input id="adv-note" placeholder="UPI transaction ID, cheque no., etc.">
    <button class="btn btn-primary" style="margin-top:14px;width:100%;" onclick="submitAdvancePayment(${residentId})">Save advance instalment</button>
  `);
}

async function submitAdvancePayment(residentId) {
  const amount = parseInt(document.getElementById('adv-amount').value, 10);
  const payment_mode = document.getElementById('adv-mode').value;
  const reference_note = document.getElementById('adv-note').value.trim();
  const dateInput = document.getElementById('adv-date');
  const payment_date = dateInput ? dateInput.value : null;

  if (!amount || amount <= 0) {
    showToast('Enter a valid amount.', 'error'); return;
  }
  if (dateInput && !payment_date) {
    showToast('Please pick the date received.', 'error'); return;
  }

  try {
    await api('/payments', {
      method: 'POST',
      body: JSON.stringify({
        resident_id: residentId,
        amount, payment_mode,
        payment_type: 'advance',
        reference_note, payment_date,
      }),
    });
    closeModal();
    showToast('Advance instalment recorded.', 'success');
    loadRent();
  } catch (e) {
    showToast(e.message, 'error');
  }
}
