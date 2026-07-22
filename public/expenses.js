// ===== Expenses screen =====

const EXPENSE_CATEGORIES = [
  { value: 'groceries', label: 'Groceries (food ingredients)' },
  { value: 'milk', label: 'Milk' },
  { value: 'electricity', label: 'Electricity' },
  { value: 'water', label: 'Water' },
  { value: 'wifi', label: 'Wi-Fi' },
  { value: 'landlord_rent', label: 'Rent paid to Landlord' },
  { value: 'salary', label: 'Staff Salary' },
  // Cleaning and Housekeeping overlapped and neither was ever actually used
  // in real data -- merged into one so future entries don't have to guess
  // which of the two nearly-identical options to pick.
  { value: 'housekeeping', label: 'Housekeeping & Cleaning' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'repairs', label: 'Repairs' },
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'furniture', label: 'Furniture' },
  { value: 'personal_family', label: 'Personal / Family' },
  { value: 'other', label: 'Other' },
];

const CATEGORY_LABEL_MAP = Object.fromEntries(EXPENSE_CATEGORIES.map(c => [c.value, c.label]));

let expenseMonthFilter = new Date().toISOString().slice(0, 7);
// Which sub-view of this screen is showing -- 'expenses' (money out) or
// 'income' (money in, for PGs collected in bulk rather than per-resident).
// Both are fetched together on every load so switching between them is
// instant, no extra round-trip.
let expenseView = 'expenses';

async function loadExpenses() {
  const el = document.getElementById('screen-expenses');
  el.innerHTML = `<div class="card"><div class="empty-state">Loading…</div></div>`;
  if (!state.currentPgId) {
    el.innerHTML = `<div class="card"><div class="empty-state"><div class="empty-state-title">No PG selected</div></div></div>`;
    return;
  }
  try {
    [state.expensesData, state.incomeData] = await Promise.all([
      api(`/expenses?month=${expenseMonthFilter}`),
      api(`/income?month=${expenseMonthFilter}`),
    ]);
    renderExpenses();
  } catch (e) {
    el.innerHTML = `<div class="card"><div class="empty-state-title">Couldn't load expenses</div><div>${e.message}</div></div>`;
  }
}

function changeExpenseMonth(delta) {
  const [y, m] = expenseMonthFilter.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  expenseMonthFilter = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  loadExpenses();
}

function setExpenseView(view) {
  expenseView = view;
  renderExpenses();
}

function renderExpenses() {
  const el = document.getElementById('screen-expenses');

  el.innerHTML = `
    <div class="month-nav">
      <button onclick="changeExpenseMonth(-1)">‹</button>
      <div class="month-nav-label">${monthLabel(expenseMonthFilter)}</div>
      <button onclick="changeExpenseMonth(1)">›</button>
    </div>
    <div class="segmented">
      <button class="${expenseView === 'expenses' ? 'active' : ''}" onclick="setExpenseView('expenses')">Expenses</button>
      <button class="${expenseView === 'income' ? 'active' : ''}" onclick="setExpenseView('income')">Income</button>
    </div>
    ${expenseView === 'income' ? renderIncomeView() : renderExpensesView()}
  `;
}

function renderExpensesView() {
  const { rows, by_category, total } = state.expensesData;
  const categoryEntries = Object.entries(by_category || {}).sort((a, b) => b[1] - a[1]);

  return `
    <div class="card">
      <div class="stat-box" style="width:100%;">
        <div class="stat-num">${fmtMoney(total)}</div>
        <div class="stat-label">${monthLabel(expenseMonthFilter)} total expenses</div>
      </div>
    </div>

    ${categoryEntries.length > 0 ? `
      <div class="card">
        <div class="card-title">By Category</div>
        ${categoryEntries.map(([cat, amt]) => `
          <div class="list-row">
            <div class="list-row-main"><div class="list-row-title" style="font-size:13.5px;">${CATEGORY_LABEL_MAP[cat] || cat}</div></div>
            <div class="list-row-amount">${fmtMoney(amt)}</div>
          </div>
        `).join('')}
      </div>
    ` : ''}

    <div class="card">
      <div class="card-title">All Entries</div>
      ${rows.length === 0 ? `
        <div class="empty-state">
          <div class="empty-state-title">No expenses logged in ${monthLabel(expenseMonthFilter)}</div>
          <div>Tap + to record groceries, milk, electricity, landlord rent, etc.</div>
        </div>
      ` : rows.map(e => `
        <div class="list-row" onclick="openEditExpenseModal(${e.id})" style="cursor:pointer;">
          <div class="list-row-main">
            <div class="list-row-title">${CATEGORY_LABEL_MAP[e.category] || e.category}</div>
            <div class="list-row-sub">${e.description ? escapeHtml(e.description) + ' · ' : ''}${fmtDate(e.expense_date)} · by ${escapeHtml(e.paid_by || '—')}</div>
          </div>
          <div class="list-row-amount">${fmtMoney(e.amount)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderIncomeView() {
  const { rows, total } = state.incomeData;

  return `
    <div class="card">
      <div class="stat-box" style="width:100%;">
        <div class="stat-num green">${fmtMoney(total)}</div>
        <div class="stat-label">${monthLabel(expenseMonthFilter)} total income</div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">All Entries</div>
      ${rows.length === 0 ? `
        <div class="empty-state">
          <div class="empty-state-title">No income logged in ${monthLabel(expenseMonthFilter)}</div>
          <div>Tap + to record a bulk rent collection or other lump-sum income for this PG.</div>
        </div>
      ` : rows.map(i => `
        <div class="list-row" onclick="openEditIncomeModal(${i.id})" style="cursor:pointer;">
          <div class="list-row-main">
            <div class="list-row-title">${escapeHtml(i.source || 'Income')}</div>
            <div class="list-row-sub">${i.description ? escapeHtml(i.description) + ' · ' : ''}${fmtDate(i.income_date)} · by ${escapeHtml(i.recorded_by || '—')}</div>
          </div>
          <div class="list-row-amount" style="color:var(--text-success,#2E7D32);">+${fmtMoney(i.amount)}</div>
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
      ${EXPENSE_CATEGORIES.map(c => `<option value="${c.value}">${c.label}</option>`).join('')}
    </select>
    <label>Amount</label>
    <input id="exp-amount" type="number" placeholder="0">
    <label>Date</label>
    <input id="exp-date" type="date" value="${today}">
    <label>Description (optional)</label>
    <input id="exp-desc" placeholder="e.g. June electricity bill, or which vendor">
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
    expenseMonthFilter = expense_date.slice(0, 7);
    loadExpenses();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function openEditExpenseModal(expenseId) {
  const e = state.expensesData.rows.find(x => x.id === expenseId);
  if (!e) return;

  if (state.staff.role !== 'admin') {
    openModal(`
      <div class="modal-header">
        <div class="modal-title">${CATEGORY_LABEL_MAP[e.category] || e.category}</div>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="card" style="margin-bottom:14px;">
        <div class="list-row"><div class="list-row-main"><div class="list-row-sub">Amount</div></div><div>${fmtMoney(e.amount)}</div></div>
        <div class="list-row"><div class="list-row-main"><div class="list-row-sub">Date</div></div><div>${fmtDate(e.expense_date)}</div></div>
        ${e.description ? `<div class="list-row"><div class="list-row-main"><div class="list-row-sub">Note</div></div><div>${escapeHtml(e.description)}</div></div>` : ''}
      </div>
      <p style="font-size:12.5px;color:var(--ink-soft);margin-bottom:12px;">Spotted a mistake? Flag it and the admin will review and fix it.</p>
      <button class="btn btn-outline" onclick="openFlagCorrectionModal('expense', ${expenseId})">Flag a Correction</button>
    `);
    return;
  }

  openModal(`
    <div class="modal-header">
      <div class="modal-title">Edit Expense</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <label>Category</label>
    <select id="edit-exp-category">
      ${EXPENSE_CATEGORIES.map(c => `<option value="${c.value}" ${c.value === e.category ? 'selected' : ''}>${c.label}</option>`).join('')}
    </select>
    <label>Amount</label>
    <input id="edit-exp-amount" type="number" value="${e.amount}">
    <label>Date</label>
    <input id="edit-exp-date" type="date" value="${e.expense_date}">
    <label>Description</label>
    <input id="edit-exp-desc" value="${escapeHtml(e.description || '')}">
    <button class="btn btn-primary" style="margin-bottom:10px;" onclick="submitEditExpense(${expenseId})">Save Changes</button>
    <button class="btn btn-danger" onclick="submitDeleteExpense(${expenseId})">Delete Entry</button>
  `);
}

async function submitEditExpense(expenseId) {
  const category = document.getElementById('edit-exp-category').value;
  const amount = parseInt(document.getElementById('edit-exp-amount').value, 10);
  const expense_date = document.getElementById('edit-exp-date').value;
  const description = document.getElementById('edit-exp-desc').value.trim();

  try {
    await api(`/expenses/${expenseId}`, {
      method: 'PATCH',
      body: JSON.stringify({ category, amount, expense_date, description }),
    });
    closeModal();
    showToast('Expense updated.', 'success');
    loadExpenses();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function submitDeleteExpense(expenseId) {
  try {
    await api(`/expenses/${expenseId}`, { method: 'DELETE' });
    closeModal();
    showToast('Expense deleted.', 'success');
    loadExpenses();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ===== Income (bulk collections for PGs not tracked per-resident) =====

function openAddIncomeModal() {
  const today = new Date().toISOString().slice(0, 10);
  openModal(`
    <div class="modal-header">
      <div class="modal-title">Add Income</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <label>Amount</label>
    <input id="inc-amount" type="number" placeholder="0">
    <label>Date</label>
    <input id="inc-date" type="date" value="${today}">
    <label>Source (optional)</label>
    <input id="inc-source" placeholder="e.g. Bulk rent collection, Sub-lease payment">
    <label>Description (optional)</label>
    <input id="inc-desc" placeholder="Any extra detail">
    <button class="btn btn-primary" onclick="submitAddIncome()">Save Income</button>
  `);
}

async function submitAddIncome() {
  const amount = parseInt(document.getElementById('inc-amount').value, 10);
  const income_date = document.getElementById('inc-date').value;
  const source = document.getElementById('inc-source').value.trim();
  const description = document.getElementById('inc-desc').value.trim();

  if (!amount || amount <= 0) {
    showToast('Enter a valid amount.', 'error');
    return;
  }

  try {
    await api('/income', {
      method: 'POST',
      body: JSON.stringify({ amount, income_date, source, description }),
    });
    closeModal();
    showToast('Income saved.', 'success');
    expenseMonthFilter = income_date.slice(0, 7);
    expenseView = 'income';
    loadExpenses();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function openEditIncomeModal(incomeId) {
  const i = state.incomeData.rows.find(x => x.id === incomeId);
  if (!i) return;

  if (state.staff.role !== 'admin') {
    openModal(`
      <div class="modal-header">
        <div class="modal-title">${escapeHtml(i.source || 'Income')}</div>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="card" style="margin-bottom:14px;">
        <div class="list-row"><div class="list-row-main"><div class="list-row-sub">Amount</div></div><div>${fmtMoney(i.amount)}</div></div>
        <div class="list-row"><div class="list-row-main"><div class="list-row-sub">Date</div></div><div>${fmtDate(i.income_date)}</div></div>
        ${i.description ? `<div class="list-row"><div class="list-row-main"><div class="list-row-sub">Note</div></div><div>${escapeHtml(i.description)}</div></div>` : ''}
      </div>
      <p style="font-size:12.5px;color:var(--ink-soft);">Only an admin can edit an income entry — let them know if something's wrong here.</p>
    `);
    return;
  }

  openModal(`
    <div class="modal-header">
      <div class="modal-title">Edit Income</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <label>Amount</label>
    <input id="edit-inc-amount" type="number" value="${i.amount}">
    <label>Date</label>
    <input id="edit-inc-date" type="date" value="${i.income_date}">
    <label>Source</label>
    <input id="edit-inc-source" value="${escapeHtml(i.source || '')}">
    <label>Description</label>
    <input id="edit-inc-desc" value="${escapeHtml(i.description || '')}">
    <button class="btn btn-primary" style="margin-bottom:10px;" onclick="submitEditIncome(${incomeId})">Save Changes</button>
    <button class="btn btn-danger" onclick="submitDeleteIncome(${incomeId})">Delete Entry</button>
  `);
}

async function submitEditIncome(incomeId) {
  const amount = parseInt(document.getElementById('edit-inc-amount').value, 10);
  const income_date = document.getElementById('edit-inc-date').value;
  const source = document.getElementById('edit-inc-source').value.trim();
  const description = document.getElementById('edit-inc-desc').value.trim();

  try {
    await api(`/income/${incomeId}`, {
      method: 'PATCH',
      body: JSON.stringify({ amount, income_date, source, description }),
    });
    closeModal();
    showToast('Income updated.', 'success');
    loadExpenses();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function submitDeleteIncome(incomeId) {
  try {
    await api(`/income/${incomeId}`, { method: 'DELETE' });
    closeModal();
    showToast('Income entry deleted.', 'success');
    loadExpenses();
  } catch (e) {
    showToast(e.message, 'error');
  }
}
