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

// A hung /me or /setup check during boot means the user never sees anything
// but the logo/splash, forever -- this is the recurring "stuck on logo"
// symptom. fetch() has no built-in timeout, and unlike a normal in-app
// action (where a spinner/toast can show something's happening), a boot-
// time hang has nothing else on screen to fall back to. Bounds ONLY these
// two boot-time checks to a few seconds so a dead/slow connection falls
// through to the login screen instead of hanging indefinitely -- the
// network is still bad either way, but the user lands somewhere they can
// see and retry from, instead of a dead splash with no way forward.
async function apiWithTimeout(path, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await api(path, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
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

// Refund payments are stored as NEGATIVE amounts (see functions/api/
// payments.js) so a plain SUM() nets them correctly everywhere else --
// but every place that displays an individual payment row needs to show
// it as a positive number with a sign/color that makes the direction of
// money obvious, not a raw "-₹5,000" from fmtMoney. Shared here since
// residents.js, rent.js and reports.js all render payment history lists.
function paymentAmountLabel(p) {
  const amt = fmtMoney(Math.abs(p.amount));
  return p.payment_type === 'refund'
    ? `<span style="color:var(--red,#B23B3B);">-${amt}</span>`
    : `<span style="color:var(--green,#2E7D32);">+${amt}</span>`;
}

// ---- Payment receipt (shared by residents.js and reports.js) ----
// Expects a single flattened payment object: the raw payment fields
// (id, amount, payment_type, payment_date, payment_mode, collected_by,
// reference_note) PLUS resident_name, phone, floor, room_number, bed_label
// merged onto it -- residents.js builds this by spreading its resident
// object's fields on; reports.js's /payments rows already come back this
// shape directly from the backend.
const PAYMENT_TYPE_LABELS = { rent: 'Rent Payment', advance: 'Advance Payment', refund: 'Refund' };
let currentPaymentReceiptData = null; // { p, pg } -- for sharePaymentReceiptPdf, same pattern as check-in receipts' currentReceiptData

function renderPaymentReceipt(p) {
  const pg = state.pgList.find(x => x.id === state.currentPgId);
  currentPaymentReceiptData = { p, pg };
  const pgName = pg ? pg.name : '';
  const pgPrefix = pgName.split(' ').map(w => w[0]).filter(Boolean).join('').toUpperCase().slice(0, 6) || 'PG';
  const receiptNo = `${pgPrefix}-PAY-${p.id}`;
  const roomLabel = [p.floor, p.room_number ? `${p.room_number}${p.bed_label ? '-' + p.bed_label : ''}` : null].filter(Boolean).join(' ');
  const isRefund = p.payment_type === 'refund';

  openModal(`
    <div class="modal-header">
      <div class="modal-title">Payment Receipt</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div id="receipt-printable">
      <div class="card" style="margin-bottom:12px;">
        <div style="text-align:center;margin-bottom:10px;">
          <div style="font-weight:800;font-size:16px;color:var(--navy);">${escapeHtml(pgName)}</div>
          ${pg && pg.address ? `<div style="font-size:11px;color:var(--ink-soft);margin-top:2px;">${escapeHtml(pg.address)}</div>` : ''}
          <div style="font-size:12px;color:var(--ink-soft);margin-top:4px;">Payment Receipt · ${receiptNo}</div>
        </div>
        <div class="list-row"><div class="list-row-main"><div class="list-row-sub">Resident</div></div><div>${escapeHtml(p.resident_name || '')}</div></div>
        <div class="list-row"><div class="list-row-main"><div class="list-row-sub">Phone</div></div><div>${escapeHtml(p.phone || '—')}</div></div>
        ${roomLabel ? `<div class="list-row"><div class="list-row-main"><div class="list-row-sub">Room</div></div><div>${escapeHtml(roomLabel)}</div></div>` : ''}
        <div class="list-row"><div class="list-row-main"><div class="list-row-sub">Type</div></div><div>${PAYMENT_TYPE_LABELS[p.payment_type] || p.payment_type}</div></div>
        <div class="list-row"><div class="list-row-main"><div class="list-row-sub">Amount</div></div><div style="font-weight:700;${isRefund ? 'color:#B23B3B;' : 'color:#2E7D32;'}">${isRefund ? '-' : '+'}${fmtMoney(Math.abs(p.amount))}</div></div>
        <div class="list-row"><div class="list-row-main"><div class="list-row-sub">Date</div></div><div>${fmtDate(p.payment_date)}</div></div>
        <div class="list-row"><div class="list-row-main"><div class="list-row-sub">Mode</div></div><div>${escapeHtml(p.payment_mode || 'cash')}</div></div>
        ${p.collected_by ? `<div class="list-row"><div class="list-row-main"><div class="list-row-sub">${isRefund ? 'Issued by' : 'Collected by'}</div></div><div>${escapeHtml(p.collected_by)}</div></div>` : ''}
        ${p.reference_note ? `<div class="list-row"><div class="list-row-main"><div class="list-row-sub">Note</div></div><div>${escapeHtml(p.reference_note)}</div></div>` : ''}
      </div>
      <p style="font-size:11px;color:var(--ink-soft);text-align:center;">Generated ${fmtDate(new Date().toISOString().slice(0,10))}</p>
    </div>
    <button class="btn btn-primary" style="margin-top:14px;width:100%;" id="share-payment-receipt-btn" onclick="sharePaymentReceiptPdf()">📤 Share Receipt (PDF)</button>
    <button class="btn btn-outline" style="margin-top:8px;width:100%;" onclick="printPaymentReceipt()">Print / Save as PDF</button>
  `);
}

// Builds an actual PDF (not just a print dialog) so it can go straight to
// WhatsApp/Email via the device's native share sheet -- same jsPDF pattern
// as check-in receipts' buildReceiptPdf in residents.js.
function buildPaymentReceiptPdf(p, pg) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 48;
  let y = 56;
  const pgName = pg ? pg.name : '';
  const pgPrefix = pgName.split(' ').map(w => w[0]).filter(Boolean).join('').toUpperCase().slice(0, 6) || 'PG';
  const receiptNo = `${pgPrefix}-PAY-${p.id}`;
  const roomLabel = [p.floor, p.room_number ? `${p.room_number}${p.bed_label ? '-' + p.bed_label : ''}` : null].filter(Boolean).join(' ');
  const isRefund = p.payment_type === 'refund';

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 42, 74);
  doc.text(pgName || 'Payment Receipt', pageWidth / 2, y, { align: 'center' });
  y += 18;

  if (pg && pg.address) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(pg.address, pageWidth / 2, y, { align: 'center', maxWidth: pageWidth - margin * 2 });
    y += 16;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text(`Payment Receipt · ${receiptNo}`, pageWidth / 2, y, { align: 'center' });
  y += 26;

  doc.setDrawColor(220);
  doc.line(margin, y, pageWidth - margin, y);
  y += 18;

  const rows = [
    ['Resident', p.resident_name || ''],
    ['Phone', p.phone || '—'],
    ...(roomLabel ? [['Room', roomLabel]] : []),
    ['Type', PAYMENT_TYPE_LABELS[p.payment_type] || p.payment_type],
    ['Amount', `${isRefund ? '-' : '+'}${fmtMoney(Math.abs(p.amount))}`],
    ['Date', fmtDate(p.payment_date)],
    ['Mode', p.payment_mode || 'cash'],
    ...(p.collected_by ? [[isRefund ? 'Issued by' : 'Collected by', p.collected_by]] : []),
    ...(p.reference_note ? [['Note', p.reference_note]] : []),
  ];

  doc.setFontSize(11);
  rows.forEach(([label, val]) => {
    doc.setTextColor(120);
    doc.text(label, margin, y);
    doc.setTextColor(30);
    doc.text(String(val), pageWidth - margin, y, { align: 'right', maxWidth: pageWidth - margin * 2 - 100 });
    y += 20;
  });

  y += 14;
  doc.setFontSize(9);
  doc.setTextColor(130);
  doc.text(`Generated ${fmtDate(new Date().toISOString().slice(0,10))}`, pageWidth / 2, y, { align: 'center' });

  return doc;
}

async function sharePaymentReceiptPdf() {
  if (!currentPaymentReceiptData) { showToast('Receipt data not loaded.', 'error'); return; }
  const { p, pg } = currentPaymentReceiptData;
  const btn = document.getElementById('share-payment-receipt-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Preparing PDF…'; }

  try {
    const doc = buildPaymentReceiptPdf(p, pg);
    const fileName = `payment-receipt-${p.id}.pdf`;
    const pdfBlob = doc.output('blob');
    const file = new File([pdfBlob], fileName, { type: 'application/pdf' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: `Payment Receipt — ${p.resident_name || ''}`,
        text: `Payment receipt for ${p.resident_name || ''}`,
      });
    } else {
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('Sharing isn\'t supported on this browser — PDF downloaded instead. Attach it from your downloads to WhatsApp/Email.', '');
    }
  } catch (e) {
    if (e.name !== 'AbortError') showToast('Could not share receipt: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📤 Share Receipt (PDF)'; }
  }
}

function printPaymentReceipt() {
  const content = document.getElementById('receipt-printable').innerHTML;
  const win = window.open('', '_blank');
  win.document.write(`
    <html><head><title>Payment Receipt</title>
    <style>body{font-family:-apple-system,sans-serif;padding:24px;color:#262321;} .list-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee;} .card{margin-bottom:16px;}</style>
    </head><body>${content}</body></html>
  `);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
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
    const { setupComplete } = await apiWithTimeout('/setup');
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
  if (state.staff.role !== 'admin' && !canSwitchPg()) {
    // Locked to exactly one PG (the normal case): always that one, never
    // whatever happened to be first in pgList. This used to only apply to
    // role === 'staff' -- a pg_manager assigned to a single PG fell through
    // to the "pick pgList[0]" branch below instead, which is wrong the
    // moment pgList[0] isn't actually their PG (the backend would still
    // enforce the correct PG on every request regardless, but the header's
    // PG name label could show the wrong property).
    state.currentPgId = state.staff.pgId;
  } else if (state.pgList.length > 0) {
    // Admin, or a multi-PG staff/pg_manager: restore whichever PG was last
    // being viewed (persisted across reloads by selectPg() in pgs.js) --
    // without this, state.currentPgId is always null on a fresh page load
    // (in-memory state doesn't survive a refresh), so this branch used to
    // ALWAYS fall through to "first PG in the list" no matter which
    // property you'd actually been viewing. That's the "refresh silently
    // switches me to a different PG" bug: after a reload, whichever PG
    // happens to sort first (or be first in pgIds) won that race every
    // single time, regardless of what was on screen a moment ago.
    let lastPgId = null;
    try { lastPgId = parseInt(localStorage.getItem('pg_last_pg_id'), 10) || null; } catch {}
    const stillAssigned = lastPgId && state.pgList.some(p => p.id === lastPgId);
    state.currentPgId = stillAssigned ? lastPgId : (state.staff.pgIds ? state.staff.pgIds[0] : state.pgList[0].id);
  }
  updatePgLabel();

  // Hide the PG switcher entirely when there's nothing to switch between.
  document.getElementById('pg-switcher').style.cursor = canSwitchPg() ? 'pointer' : 'default';

  // Land back on whichever tab was open before a refresh/reload, instead of
  // always bouncing to Dashboard -- that "always resets to Home" behaviour
  // was what looked like the page randomly navigating away on its own.
  let lastTab = 'dashboard';
  try {
    const saved = localStorage.getItem('pg_last_tab');
    if (saved && TAB_TITLES[saved] && (saved !== 'settings' || state.staff.role === 'admin' || state.staff.role === 'pg_manager')) {
      lastTab = saved;
    }
  } catch {}
  switchTab(lastTab);

  // Fire-and-forget -- must never block or fail app entry (Notification API
  // support, permission state, and the /rent fetch are all best-effort here).
  checkDueNotifications();
}

// Notifies (if permission was already granted via enableDueNotifications in
// settings.js) when this PG has anyone overdue or due soon -- checked once
// per calendar day per PG, on app entry and on switching properties, NOT on
// every single screen change (that would be spammy, not a reminder). This
// only fires while the app is actually open -- there is no background/
// closed-app push here, see the Menu > Rent Due card for why.
async function checkDueNotifications() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (!state.currentPgId) return;

  const today = new Date().toISOString().slice(0, 10);
  const key = `pg_dues_notified_${state.currentPgId}`;
  try {
    if (localStorage.getItem(key) === today) return;
  } catch {}

  try {
    const duesList = computeDuesSummary((await api('/rent')).rows);
    if (duesList.length > 0) {
      const overdueCount = duesList.filter(r => r.isOverdue).length;
      const dueSoonCount = duesList.length - overdueCount;
      const parts = [];
      if (overdueCount > 0) parts.push(`${overdueCount} overdue`);
      if (dueSoonCount > 0) parts.push(`${dueSoonCount} due soon`);
      const pg = state.pgList.find(p => p.id === state.currentPgId);
      new Notification('Rent Due & Overdue' + (pg ? ` — ${pg.name}` : ''), {
        body: `${parts.join(', ')}. Open the app to review.`,
        icon: '/icon-192.png',
        tag: 'rent-dues-' + state.currentPgId, // replaces any earlier one for this PG instead of stacking
      });
    }
    try { localStorage.setItem(key, today); } catch {}
  } catch {
    // /rent fetch failed -- silently skip, this is a best-effort reminder,
    // not something that should surface an error to the user.
  }
}

// True for admin (sees every PG) or a staff/pg_manager account explicitly
// assigned to more than one PG. Shared by enterApp() (switcher cursor) and
// pgs.js (openPgSwitcher's guard) so the two can't disagree about who gets
// a switcher at all.
function canSwitchPg() {
  return state.staff.role === 'admin' || (Array.isArray(state.staff.pgIds) && state.staff.pgIds.length > 1);
}

// Every PG otherwise shares the exact same logo, navy header and theme --
// nothing visually told two properties apart, which is exactly how someone
// can end up recording a payment or expense against the wrong PG without
// noticing. Deterministic per pg_id (not per name/position), so a given
// property always gets the same color no matter what order pgList sorts in.
const PG_ACCENT_PALETTE = ['#E67E22', '#16A085', '#8E44AD', '#C0392B', '#2980B9', '#D4AC0D', '#27AE60', '#D35400'];
function pgAccentColor(pgId) {
  if (!pgId) return PG_ACCENT_PALETTE[0];
  return PG_ACCENT_PALETTE[pgId % PG_ACCENT_PALETTE.length];
}

function updatePgLabel() {
  const pg = state.pgList.find(p => p.id === state.currentPgId);
  document.getElementById('pg-name-label').textContent = pg ? pg.name : '—';

  const accent = pgAccentColor(state.currentPgId);
  const header = document.querySelector('.app-header');
  if (header) header.style.borderBottom = `4px solid ${accent}`;
  const dot = document.getElementById('pg-color-dot');
  if (dot) dot.style.background = accent;
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
  // Remembered across reloads so refreshing the page (or the browser
  // restoring the tab) lands back where you were instead of always
  // bouncing to Dashboard -- see enterApp() below, which reads this back.
  try { localStorage.setItem('pg_last_tab', tab); } catch {}
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
    else if (tab === 'expenses') { if (expenseView === 'income') openAddIncomeModal(); else openAddExpenseModal(); }
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

async function loadMenu() {
  const el = document.getElementById('screen-menu');
  el.innerHTML = `<div class="card"><div class="empty-state">Loading…</div></div>`;

  // computeDuesSummary/renderDuesSummaryCard live in settings.js -- reused
  // here rather than duplicated, since Menu is now where this actually
  // needs to be seen (previously buried a tap deeper inside Settings).
  let duesList = [];
  try { duesList = computeDuesSummary((await api('/rent')).rows); } catch {}

  el.innerHTML = `
    ${renderDuesSummaryCard(duesList)}
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
    const me = await apiWithTimeout('/me');
    state.staff = me;
    state.currentPgId = me.pgId || null;
    await enterApp();
    return;
  } catch {}
  checkSetup();
})();
