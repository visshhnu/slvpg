// ===== Expenses screen =====

const EXPENSE_CATEGORIES = ['electricity', 'maintenance', 'salary', 'groceries', 'wifi', 'water', 'other'];

async function loadExpenses() {
  const el = document.getElementById('screen-expenses');
  el.innerHTML = `<div class="card"><div class="empty-state">Loading…</div></div>`;
  try {
    state.expenses = await api('/expenses');
    renderExpenses();
  } catch (e) {
    el.innerHTML = `<div class="card"><div class="empty-state-title">Couldn't load expenses</div><div>${e.message}</div></div>`;
  }
}

function renderExpenses() {
  const el = document.getElementById('screen-expenses');
  const thisMonth = new Date().toISOString().slice(0, 7);
  const thisMonthTotal = state.expenses
    .filter(e => e.expense_date.startsWith(thisMonth))
    .reduce((s, e) => s + e.amount, 0);

  el.innerHTML = `
    <div class="card">
      <div class="card-title">This Month</div>
      <div class="stat-box" style="width:100%;">
        <div class="stat-num">${fmtMoney(thisMonthTotal)}</div>
        <div class="stat-label">Total expenses</div>
      </div>
    </div>

    <div class="card">
      ${state.expenses.length === 0 ? `
        <div class="empty-state">
          <div class="empty-state-title">No expenses logged yet</div>
          <div>Tap + to record electricity, maintenance, salary, etc.</div>
        </div>
      ` : state.expenses.map(e => `
        <div class="list-row">
          <div class="list-row-main">
            <div class="list-row-title" style="text-transform:capitalize;">${escapeHtml(e.category)}</div>
            <div class="list-row-sub">${e.description ? escapeHtml(e.description) + ' · ' : ''}${fmtDate(e.expense_date)} · by ${escapeHtml(e.paid_by || '—')}</div>
          </div>
          <div class="list-row-amount">${fmtMoney(e.amount)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function openAddExpenseModal() {
  const today = new Date().toISOString().slice(0, 10);
  openModal(`
    <div class="modal-header">
      <div class="modal-title">Add Expense</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <label>Category</label>
    <select id="exp-category">
      ${EXPENSE_CATEGORIES.map(c => `<option value="${c}" style="text-transform:capitalize;">${c.charAt(0).toUpperCase() + c.slice(1)}</option>`).join('')}
    </select>
    <label>Amount</label>
    <input id="exp-amount" type="number" placeholder="0">
    <label>Date</label>
    <input id="exp-date" type="date" value="${today}">
    <label>Description (optional)</label>
    <input id="exp-desc" placeholder="e.g. June electricity bill">
    <button class="btn btn-primary" onclick="submitAddExpense()">Save Expense</button>
  `);
}

async function submitAddExpense() {
  const category = document.getElementById('exp-category').value;
  const amount = parseInt(document.getElementById('exp-amount').value, 10);
  const expense_date = document.getElementById('exp-date').value;
  const description = document.getElementById('exp-desc').value.trim();

  if (!amount || amount <= 0) {
    showToast('Enter a valid amount.', 'error');
    return;
  }

  try {
    await api('/expenses', {
      method: 'POST',
      body: JSON.stringify({ category, amount, expense_date, description }),
    });
    closeModal();
    showToast('Expense saved.', 'success');
    loadExpenses();
  } catch (e) {
    showToast(e.message, 'error');
  }
}
