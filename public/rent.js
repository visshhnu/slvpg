// ===== Rent screen =====

async function loadRent() {
  const el = document.getElementById('screen-rent');
  el.innerHTML = `<div class="card"><div class="empty-state">Loading…</div></div>`;
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

function renderRent() {
  const el = document.getElementById('screen-rent');
  const { summary, rows } = state.rentData;

  const statusOrder = { overdue: 0, partial: 1, pending: 2, paid: 3 };
  const sorted = [...rows].sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

  el.innerHTML = `
    <div class="month-nav">
      <button onclick="changeRentMonth(-1)">‹</button>
      <div class="month-nav-label">${monthLabel(summary.month)}</div>
      <button onclick="changeRentMonth(1)">›</button>
    </div>

    <div class="card">
      <div class="stat-grid">
        <div class="stat-box"><div class="stat-num green">${fmtMoney(summary.total_paid)}</div><div class="stat-label">Collected</div></div>
        <div class="stat-box"><div class="stat-num red">${fmtMoney(summary.total_pending)}</div><div class="stat-label">Pending</div></div>
      </div>
      ${summary.overdue_count > 0 ? `<div style="margin-top:10px;"><span class="badge badge-red">${summary.overdue_count} overdue (past 5th)</span></div>` : ''}
    </div>

    <div class="card">
      ${sorted.length === 0 ? `<div class="empty-state"><div class="empty-state-title">No residents to bill this month</div></div>` :
        sorted.map(row => `
          <div class="list-row">
            <div class="list-row-main">
              <div class="list-row-title">${escapeHtml(row.resident_name)}</div>
              <div class="list-row-sub">${row.floor || ''} ${row.room_number || ''}${row.bed_label ? '-' + row.bed_label : ''} · Due ${fmtDate(row.due_date)}</div>
            </div>
            <div style="text-align:right;">
              <div class="list-row-amount">${fmtMoney(row.amount_due - row.amount_paid)}</div>
              <span class="badge ${statusBadgeClass(row.status)}">${statusLabel(row.status)}</span>
            </div>
            ${row.status !== 'paid' ? `<button class="btn btn-gold btn-sm" onclick="openCollectPaymentModal(${row.id}, ${row.resident_id}, '${escapeHtml(row.resident_name)}', ${row.amount_due - row.amount_paid})">Collect</button>` : ''}
          </div>
        `).join('')
      }
    </div>
  `;
}

function statusBadgeClass(status) {
  return { paid: 'badge-green', partial: 'badge-amber', pending: 'badge-gray', overdue: 'badge-red' }[status] || 'badge-gray';
}
function statusLabel(status) {
  return { paid: 'Paid', partial: 'Partial', pending: 'Pending', overdue: 'Overdue' }[status] || status;
}

function openCollectPaymentModal(ledgerId, residentId, name, balance) {
  openModal(`
    <div class="modal-header">
      <div class="modal-title">Collect Rent — ${escapeHtml(name)}</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <p style="font-size:13px;color:var(--ink-soft);margin-bottom:12px;">Balance due: <strong>${fmtMoney(balance)}</strong></p>
    <label>Amount Received</label>
    <input id="pay-amount" type="number" value="${balance}">
    <label>Payment Mode</label>
    <select id="pay-mode">
      <option value="cash">Cash</option>
      <option value="upi">UPI</option>
      <option value="bank_transfer">Bank Transfer</option>
    </select>
    <label>Note (optional)</label>
    <input id="pay-note" placeholder="e.g. UPI ref number">
    <button class="btn btn-primary" onclick="submitCollectPayment(${ledgerId}, ${residentId})">Save Payment</button>
  `);
}

async function submitCollectPayment(ledgerId, residentId) {
  const amount = parseInt(document.getElementById('pay-amount').value, 10);
  const payment_mode = document.getElementById('pay-mode').value;
  const reference_note = document.getElementById('pay-note').value.trim();

  if (!amount || amount <= 0) {
    showToast('Enter a valid amount.', 'error');
    return;
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
