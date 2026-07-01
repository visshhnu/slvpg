// ===== SVPG Manager — app.js =====
// Vanilla JS single-page app. Talks to /api/* (Cloudflare Pages Functions + D1).
// Multi-PG aware: admin can switch between PGs; staff are locked to one.

const state = {
  staff: null,          // { name, role, pgId }
  currentPgId: null,    // the PG currently being viewed
  pgList: [],           // all PGs (admin) or just their one (staff)
  rooms: [],
  residents: [],
  rentMonth: new Date().toISOString().slice(0, 7),
  rentData: null,
  expensesData: null,
  currentTab: 'dashboard',
};

// ---------- low-level fetch helper ----------
// Automatically appends ?pg_id=N to every API call so every screen is scoped
// to whichever PG is currently selected.
async function api(path, options = {}) {
  let url = `/api${path}`;
  if (state.currentPgId && !path.includes('pg_id=')) {
    url += (path.includes('?') ? '&' : '?') + `pg_id=${state.currentPgId}`;
  }
  const res = await fetch(url, {
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

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
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
  const pgName = document.getElementById('setup-pgname').value.trim();
  const username = document.getElementById('setup-username').value.trim();
  const password = document.getElementById('setup-password').value;
  const errEl = document.getElementById('setup-error');
  errEl.textContent = '';

  if (!name || !username || !password) {
    errEl.textContent = 'Please fill in all required fields.';
    return;
  }
  try {
    await api('/setup', { method: 'POST', body: JSON.stringify({ name, phone, username, password, pgName }) });
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
    await enterApp();
  } catch (e) {
    errEl.textContent = e.message;
  }
}

async function doLogout() {
  await api('/logout', { method: 'POST' });
  state.staff = null;
  state.currentPgId = null;
  document.getElementById('app-shell').classList.add('hidden');
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('login-password').value = '';
}

async function enterApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');

  // Load the PG list, pick which one to view
  state.pgList = await api('/pgs');
  if (state.staff.role === 'staff') {
    state.currentPgId = state.staff.pgId;
  } else if (state.pgList.length > 0) {
    state.currentPgId = state.currentPgId || state.pgList[0].id;
  }
  updatePgLabel();

  // Hide the PG switcher entirely for staff (locked to one PG, nothing to switch)
  document.getElementById('pg-switcher').style.cursor = state.staff.role === 'admin' ? 'pointer' : 'default';

  switchTab('dashboard');
}

function updatePgLabel() {
  const pg = state.pgList.find(p => p.id === state.currentPgId);
  document.getElementById('pg-name-label').textContent = pg ? pg.name : '—';
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
  if (tab === 'settings' && state.staff.role !== 'admin') fab.classList.add('hidden');

  const loaders = {
    dashboard: loadDashboard,
    rooms: loadRooms,
    residents: loadResidents,
    rent: loadRent,
    expenses: loadExpenses,
    settings: loadSettings,
    reports: loadReports,
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
    state.currentPgId = me.pgId || null;
    await enterApp();
    return;
  } catch {}
  checkSetup();
})();
