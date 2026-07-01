// ===== Rent screen =====

async function loadRent() {
  const el = document.getElementById('screen-rent');
  el.innerHTML = `<div class="card"><div class="empty-state">Loading…</div></div>`;
  if (!state.currentPgId) {
    el.innerHTML = `<div class="card"><div class="empty-state"><div class="empty-state-title">No PG selected</div></div></div>`;
    return;
  }
  try {
    state.rentData = await api(`/rent?month=${state.rentMonth}`);
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

function rentStatusBadgeClass(s) {
  return { paid: 'badge-green', partial: 'badge-amber', pending: 'badge-gray', overdue: 'badge-red' }[s] || 'badge-gray';
}
function rentStatusLabel(s) {
  return { paid: 'Paid in full', partial: 'Partial', pending: 'Pending', overdue: 'Overdue' }[s] || s;
}

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
  const paid = row.advance_paid || 0;
  if (expected === 0) return '';
  const balance = expected - paid;
  const done = balance <= 0;
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;padding-top:8px;border-top:0.5px solid var(--border);">
      <div>
        <div style="font-size:10px;color:var(--text-muted);">Advance deposit</div>
        <div style="font-size:12px;font-weight:500;${done ? 'color:var(--text-success)' : 'color:var(--text-warning)'};">
          ${fmtMoney(paid)} of ${fmtMoney(expected)}
          ${done ? ' ✓' : ` — ${fmtMoney(balance)} pending`}
        </div>
      </div>
      ${!done ? `<button class="btn btn-sm" style="font-size:11px;" onclick="openAdvanceModal(${row.resident_id}, '${escapeHtml(row.resident_name)}', ${balance})">+ Add instalment</button>` : ''}
    </div>`;
}

function renderRent() {
  const el = document.getElementById('screen-rent');
  const { summary, rows } = state.rentData;

  el.innerHTML = `
    <div class="month-nav">
      <button onclick="changeRentMonth(-1)">‹</button>
      <div class="month-nav-label">${monthLabel(summary.month)}</div>
      <button onclick="changeRentMonth(1)">›</button>
    </div>

    <div class="card">
      <div class="stat-grid">
        <div class="stat-box"><div class="stat-num green">${fmtMoney(summary.total_paid)}</div><div class="stat-label">Collected</div></div>
        <div class="stat-box"><div class="stat-num red">${fmtMoney(summary.total_pending)}</div><div class="stat-label">Still pending</div></div>
      </div>
      <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap;">
        ${summary.overdue_count > 0 ? `<span class="badge badge-red">${summary.overdue_count} overdue</span>` : ''}
        ${summary.partial_count > 0 ? `<span class="badge badge-amber">${summary.partial_count} partial</span>` : ''}
        ${summary.overdue_count === 0 && summary.partial_count === 0 ? `<span class="badge badge-green">All payments on track</span>` : ''}
      </div>
    </div>

    ${rows.length === 0
      ? `<div class="card"><div class="empty-state"><div class="empty-state-title">No residents to bill this month</div></div></div>`
      : rows.map(row => renderRentCard(row)).join('')
    }
  `;
}

function renderRentCard(row) {
  const notDue = row.status === 'not_due';
  const balance = notDue ? 0 : row.amount_due - row.amount_paid;
  const hasPaidSomething = !notDue && row.amount_paid > 0;
  const isPaid = row.status === 'paid';
  const advPaid = row.advance_paid || 0;
  const advExpected = row.advance_deposit || 0;
  const advBalance = advExpected - advPaid;

  return `
    <div class="card" style="margin-bottom:10px;">

      <!-- Header: name + status -->
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px;">
        <div style="min-width:0;">
          <div style="font-size:14px;font-weight:600;">${escapeHtml(row.resident_name)}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">
            ${row.floor || ''} ${row.room_number || ''}${row.bed_label ? '-' + row.bed_label : ''}
            · Joined ${fmtDate(row.join_date)}
            ${notDue ? ' · <em>moves in</em>' : ` · Due ${fmtDate(row.due_date)}`}
          </div>
        </div>
        <span class="badge ${notDue ? 'badge-gold' : rentStatusBadgeClass(row.status)}">${notDue ? 'No rent due yet' : rentStatusLabel(row.status)}</span>
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
            <span style="color:var(--text-muted);">ADVANCE DEPOSIT</span>
            <span>${advBalance <= 0
              ? `<span style="color:var(--text-success);">${fmtMoney(advPaid)} paid ✓</span>`
              : `<span style="color:var(--text-danger);">${fmtMoney(advBalance)} pending</span> <span style="color:var(--text-muted);font-weight:400;">of ${fmtMoney(advExpected)}</span>`
            }</span>
          </div>
          ${advBalance > 0 ? `
            <button class="btn btn-sm" style="margin-top:4px;font-size:11.5px;" onclick="openAdvanceModal(${row.resident_id}, '${escapeHtml(row.resident_name)}', ${advBalance})">
              + Collect advance instalment
            </button>` : ''}
        </div>
      ` : ''}

    </div>`;
}

// --- Collect full balance ---
function openCollectModal(ledgerId, residentId, name, balance, amountDue) {
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

  if (!amount || amount <= 0) {
    showToast('Enter a valid amount.', 'error'); return;
  }

  try {
    await api('/payments', {
      method: 'POST',
      body: JSON.stringify({
        resident_id: residentId, rent_ledger_id: ledgerId,
        amount, payment_mode, payment_type: 'rent', reference_note,
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

  if (!amount || amount <= 0) {
    showToast('Enter a valid amount.', 'error'); return;
  }

  try {
    await api('/payments', {
      method: 'POST',
      body: JSON.stringify({
        resident_id: residentId,
        amount, payment_mode,
        payment_type: 'advance',
        reference_note,
      }),
    });
    closeModal();
    showToast('Advance instalment recorded.', 'success');
    loadRent();
  } catch (e) {
    showToast(e.message, 'error');
  }
}
