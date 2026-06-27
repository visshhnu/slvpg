// ===== PG Manager — app.js =====
// Vanilla JS single-page app. No build step. Talks to /api/* (Cloudflare Pages Functions + D1).

const state = {
  staff: null,
  rooms: [],
  residents: [],
  rentMonth: new Date().toISOString().slice(0, 7),
  rentData: null,
  expenses: [],
  currentTab: 'dashboard',
};

// ---------- low-level fetch helper ----------
async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options,
  });
  let data;
  try { data = await res.json(); } catch { data = {}; }
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

function showToast(message, type = '') {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = `toast show ${type}`;
  setTimeout(() => { el.className = 'toast'; }, 2600);
}

function fmtMoney(n) {
  n = n || 0;
  return '₹' + n.toLocaleString('en-IN');
}

function fmtDate(d) {
  if (!d) return '—';
  const date = new Date(d + (d.length === 7 ? '-01' : ''));
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function monthLabel(ym) {
  const [y, m] = ym.split('-');
  const date = new Date(parseInt(y), parseInt(m) - 1, 1);
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

// ---------- AUTH ----------
async function checkSetup() {
  try {
    const { setupComplete } = await api('/setup');
    document.getElementById('setup-form').classList.toggle('hidden', setupComplete);
    document.getElementById('login-form').classList.toggle('hidden', !setupComplete);
  } catch {
    document.getElementById('login-form').classList.remove('hidden');
  }
}

async function doSetup() {
  const name = document.getElementById('setup-name').value.trim();
  const phone = document.getElementById('setup-phone').value.trim();
  const username = document.getElementById('setup-username').value.trim();
  const password = document.getElementById('setup-password').value;
  const errEl = document.getElementById('setup-error');
  errEl.textContent = '';

  if (!name || !username || !password) {
    errEl.textContent = 'Please fill in all required fields.';
    return;
  }
  try {
    await api('/setup', { method: 'POST', body: JSON.stringify({ name, phone, username, password }) });
    showToast('Account created. Please log in.', 'success');
    document.getElementById('setup-form').classList.add('hidden');
    document.getElementById('login-form').classList.remove('hidden');
    document.getElementById('login-username').value = username;
  } catch (e) {
    errEl.textContent = e.message;
  }
}

async function doLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';

  if (!username || !password) {
    errEl.textContent = 'Enter your username and password.';
    return;
  }
  try {
    const data = await api('/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    state.staff = data;
    enterApp();
  } catch (e) {
    errEl.textContent = e.message;
  }
}

async function doLogout() {
  await api('/logout', { method: 'POST' });
  state.staff = null;
  document.getElementById('app-shell').classList.add('hidden');
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('login-password').value = '';
}

function enterApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');
  document.getElementById('staff-name-label').textContent = `${state.staff.name} · ${state.staff.role}`;
  switchTab('dashboard');
}

// ---------- TAB NAVIGATION ----------
const TAB_TITLES = {
  dashboard: 'Dashboard',
  rooms: 'Rooms & Beds',
  residents: 'Residents',
  rent: 'Rent Collection',
  expenses: 'Expenses',
  settings: 'Settings',
};

function switchTab(tab) {
  state.currentTab = tab;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${tab}`).classList.add('active');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('screen-title').textContent = TAB_TITLES[tab];

  const fab = document.getElementById('fab-btn');
  fab.classList.remove('hidden');
  fab.onclick = () => {
    if (tab === 'residents') openAddResidentModal();
    else if (tab === 'rooms') openAddRoomModal();
    else if (tab === 'expenses') openAddExpenseModal();
    else if (tab === 'settings') openAddStaffModal();
    else fab.classList.add('hidden');
  };
  if (tab === 'dashboard' || tab === 'rent') fab.classList.add('hidden');
  if (tab === 'settings' && state.staff.role !== 'owner') fab.classList.add('hidden');

  const loaders = {
    dashboard: loadDashboard,
    rooms: loadRooms,
    residents: loadResidents,
    rent: loadRent,
    expenses: loadExpenses,
    settings: loadSettings,
  };
  loaders[tab]();
}

function closeModal() {
  document.getElementById('modal-backdrop').classList.remove('open');
}
function openModal(html) {
  document.getElementById('modal-sheet').innerHTML = html;
  document.getElementById('modal-backdrop').classList.add('open');
}
document.getElementById('modal-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'modal-backdrop') closeModal();
});

// ---------- INIT ----------
(async function init() {
  try {
    const me = await api('/me');
    state.staff = me;
    enterApp();
    return;
  } catch {}
  checkSetup();
})();
