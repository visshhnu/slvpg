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

// ---------- Shared rent/advance status vocabulary ----------
// Single source of label/color mapping so Rent tab, Residents tab and the
// resident detail modal never describe the same underlying state with
// different words (mirrors functions/_ledger.js on the backend, which is
// the single source of the actual numbers these labels describe).
const RENT_STATUS_LABELS = { paid: 'Rent paid', partial: 'Rent partial', pending: 'Rent due', overdue: 'Rent overdue', not_due: 'Move-in scheduled' };
const RENT_STATUS_BADGE_CLASS = { paid: 'badge-green', partial: 'badge-amber', pending: 'badge-gray', overdue: 'badge-red', not_due: 'badge-gold' };
function rentStatusLabel(status) { return RENT_STATUS_LABELS[status] || status; }
function rentStatusBadgeClass(status) { return RENT_STATUS_BADGE_CLASS[status] || 'badge-gray'; }

const ADVANCE_STATUS_LABELS = { pending: 'Advance pending', partial: 'Advance partial', paid: 'Advance paid', overpaid: 'Advance overpaid' };
const ADVANCE_STATUS_BADGE_CLASS = { pending: 'badge-amber', partial: 'badge-amber', paid: 'badge-green', overpaid: 'badge-gold' };
// expected/paid always come from the backend (residents.advance_paid,
// re-derived on every payment change by functions/_ledger.js) -- this only
// decides which label/colour to show for a given balance.
function advanceState(expected, paid) {
  expected = expected || 0; paid = paid || 0;
  const balance = expected - paid;
  let status;
  if (expected <= 0) status = 'not_applicable';
  else if (paid <= 0) status = 'pending';
  else if (balance > 0) status = 'partial';
  else if (balance < 0) status = 'overpaid';
  else status = 'paid';
  return { expected, paid, balance, status };
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
  // If we just logged out, setup was already complete -- always show the
  // login form here, never "Create Admin Account". Without this, anyone
  // whose session was still valid on page load (the normal case) never had
  // checkSetup() run for them at all -- that only runs from init()'s catch
  // branch, when there's NO valid session yet -- so setup-form/login-form
  // were sitting at their raw HTML defaults (setup visible, login hidden)
  // the entire time, invisibly, while auth-screen itself was hidden. The
  // moment logout reveals auth-screen again, that leftover default is what
  // showed: the setup screen, not the login screen. This is exactly the
  // "logs out and lands on Create Admin Account" bug.
  document.getElementById('setup-form').classList.add('hidden');
  document.getElementById('login-form').classList.remove('hidden');
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
  reports: 'Reports',
  menu: 'Menu',
};

// Short, tab-specific description shown next to the PG name in the header,
// so the page identity is never just a title alone -- Reports had no entry
// here or in TAB_TITLES at all before, so opening it left the header
// showing whatever the previous tab's title happened to be.
const TAB_SUBTITLES = {
  dashboard: "Today's activity, occupancy, and key alerts",
  rooms: 'Floor-wise room and bed occupancy',
  residents: 'Resident records, status, and onboarding',
  rent: 'Monthly rent, advances, dues, and exceptions',
  expenses: 'Operational spending and monthly expense tracking',
  settings: 'Staff & PG configuration',
  reports: 'Financial summaries, exports, and printable statements',
  menu: 'Reports, settings, and more',
};

// Reports and Settings no longer have their own bottom-nav slot -- they're
// opened from inside the Menu tab instead (see loadMenu below), which is
// what actually fixed Settings being completely unreachable (there was no
// button anywhere that called switchTab('settings') at all). Both screens
// still exist and work exactly as before; only navigation into them moved.
// Grouping them under "menu" here just keeps the bottom nav's active-tab
// highlight lit on Menu while you're inside either one, instead of showing
// no tab selected at all.
const MENU_GROUP_TABS = ['reports', 'settings', 'menu'];

function switchTab(tab) {
  state.currentTab = tab;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${tab}`).classList.add('active');
  const navHighlight = MENU_GROUP_TABS.includes(tab) ? 'menu' : tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === navHighlight));
  document.getElementById('screen-title').textContent = TAB_TITLES[tab];
  document.getElementById('tab-subtitle').textContent = TAB_SUBTITLES[tab] || '';

  const fab = document.getElementById('fab-btn');
  fab.classList.remove('hidden');
  fab.onclick = () => {
    if (tab === 'residents') openAddResidentModal();
    else if (tab === 'rooms') openAddRoomModal();
    else if (tab === 'expenses') openAddExpenseModal();
    else if (tab === 'settings') openAddStaffModal();
    else fab.classList.add('hidden');
  };
  if (tab === 'dashboard' || tab === 'rent' || tab === 'menu') fab.classList.add('hidden');
  if (tab === 'settings' && state.staff.role !== 'admin') fab.classList.add('hidden');

  const loaders = {
    dashboard: loadDashboard,
    rooms: loadRooms,
    residents: loadResidents,
    rent: loadRent,
    expenses: loadExpenses,
    settings: loadSettings,
    reports: loadReports,
    menu: loadMenu,
  };
  loaders[tab]();
}

// Landing screen for the Menu tab -- currently just Reports and Settings,
// but the whole point of moving them here (instead of trying to squeeze a
// 7th/8th icon into the bottom nav) is that adding a third or fourth item
// later is just another card in this list, not a bottom-nav redesign.
const MENU_ITEMS = [
  { tab: 'reports',  icon: '📊', title: 'Reports',  desc: TAB_SUBTITLES.reports },
  { tab: 'settings', icon: '⚙️', title: 'Settings', desc: TAB_SUBTITLES.settings },
];

function loadMenu() {
  const el = document.getElementById('screen-menu');
  el.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:8px;">
      ${MENU_ITEMS.map(item => `
        <button onclick="switchTab('${item.tab}')" style="
          background:var(--card);border:1.5px solid var(--border);border-radius:12px;
          padding:14px;text-align:left;cursor:pointer;display:flex;align-items:center;gap:14px;width:100%;">
          <div style="font-size:22px;width:36px;text-align:center;">${item.icon}</div>
          <div>
            <div style="font-weight:700;font-size:14px;color:var(--navy);">${escapeHtml(item.title)}</div>
            <div style="font-size:11.5px;color:var(--ink-soft);margin-top:2px;">${escapeHtml(item.desc)}</div>
          </div>
        </button>
      `).join('')}
    </div>
  `;
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
