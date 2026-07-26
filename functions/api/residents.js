// functions/api/residents.js
import { requireAuth, jsonResponse, unauthorized, resolvePgId } from '../_auth.js';
import { ensureLedgerRows, deriveRentStatus } from '../_ledger.js';

export async function onRequestGet({ request, env }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const pgId = resolvePgId(session, url);
  if (!pgId) return jsonResponse({ error: 'pg_id is required' }, 400);

  const status = url.searchParams.get('status');
  const currentMonth = new Date().toISOString().slice(0, 7);

  // Same fix as dashboard.js: create this month's ledger rows before reading
  // them, so "No rent entry yet" doesn't show just because no one opened Rent tab.
  await ensureLedgerRows(env, pgId, currentMonth);

  let query = `
    SELECT
      res.*,
      b.bed_label, r.floor, r.room_number, r.monthly_rent, r.sharing_type,
      r.advance_deposit, r.refundable_amount
    FROM residents res
    LEFT JOIN beds b ON b.id = res.bed_id
    LEFT JOIN rooms r ON r.id = b.room_id
    WHERE res.pg_id = ?
  `;
  const binds = [pgId];
  if (status) {
    query += ' AND res.status = ?';
    binds.push(status);
  }
  query += ' ORDER BY res.status, r.floor, r.room_number';

  const { results } = await env.DB.prepare(query).bind(...binds).all();

  // Batched: one query for every resident's current-month rent_ledger row,
  // one for which residents have a check-in receipt at all -- instead of 2
  // queries PER resident (was an O(2N) sequential round-trip pattern, the
  // main reason this screen got slower as more residents were added).
  const residentIds = results.map(r => r.id);
  let ledgerByResident = new Map();
  let checkedInIds = new Set();
  if (residentIds.length > 0) {
    const placeholders = residentIds.map(() => '?').join(',');
    const [ledgerResult, receiptResult] = await Promise.all([
      env.DB.prepare(
        `SELECT resident_id, amount_due, amount_paid, status, due_date
         FROM rent_ledger WHERE month = ? AND resident_id IN (${placeholders})`
      ).bind(currentMonth, ...residentIds).all(),
      env.DB.prepare(
        `SELECT DISTINCT resident_id FROM checkin_receipts WHERE resident_id IN (${placeholders})`
      ).bind(...residentIds).all(),
    ]);
    ledgerByResident = new Map(ledgerResult.results.map(r => [r.resident_id, r]));
    checkedInIds = new Set(receiptResult.results.map(r => r.resident_id));
  }

  // Same overdue derivation rent.js uses -- deriveRentStatus is the only
  // place that compares "today" to a due_date, so the two screens can't
  // disagree about whether a resident is overdue.
  const today = new Date().toISOString().slice(0, 10);
  const enriched = results.map(res => {
    const rentRow = ledgerByResident.get(res.id) || null;
    const rentStatus = rentRow ? deriveRentStatus(rentRow, today) : null;
    return {
      ...res,
      rent_this_month: rentRow ? {
        amount_due: rentRow.amount_due,
        amount_paid: rentRow.amount_paid,
        status: rentStatus,
      } : null,
      has_checkin_receipt: checkedInIds.has(res.id),
    };
  });

  return jsonResponse(enriched);
}

export async function onRequestPost({ request, env }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  try {
    const url = new URL(request.url);
    const pgId = resolvePgId(session, url);
    if (!pgId) return jsonResponse({ error: 'pg_id is required' }, 400);

    const body = await request.json();
    const {
      name, photo_url, phone, alt_phone, aadhaar_number, aadhaar_photo_url, aadhaar_back_photo_url,
      pan_number, pan_photo_url, id_proof_type, id_proof_number, id_proof_photo_url, passport_photo_url,
      occupation, company_or_college, emergency_contact_name, emergency_contact_phone,
      bed_id, join_date, agreement_signed, police_verification_status, notes,
      custom_rent, custom_advance, first_month_due_option
    } = body;

    if (!name || !phone || !bed_id || !join_date) {
      return jsonResponse({ error: 'Name, phone, bed and join date are required' }, 400);
    }

    const bed = await env.DB.prepare(
      `SELECT b.id, r.pg_id FROM beds b JOIN rooms r ON r.id = b.room_id WHERE b.id = ?`
    ).bind(bed_id).first();
    if (!bed || bed.pg_id !== pgId) {
      return jsonResponse({ error: 'That bed does not belong to this PG' }, 400);
    }
    const occupied = await env.DB.prepare(
      `SELECT id FROM residents WHERE bed_id = ? AND status != 'vacated'`
    ).bind(bed_id).first();
    if (occupied) {
      return jsonResponse({ error: 'That bed is already occupied' }, 409);
    }

    // Columns guaranteed to exist since the base migration -- always sent.
    const baseFields = [
      ['pg_id', pgId], ['name', name], ['photo_url', photo_url || null],
      ['phone', phone], ['alt_phone', alt_phone || null],
      ['aadhaar_number', aadhaar_number || null],
      ['id_proof_type', id_proof_type || null], ['id_proof_number', id_proof_number || null],
      ['occupation', occupation || null], ['company_or_college', company_or_college || null],
      ['emergency_contact_name', emergency_contact_name || null],
      ['emergency_contact_phone', emergency_contact_phone || null],
      ['bed_id', bed_id], ['join_date', join_date],
      // advance_paid is deliberately NOT settable here -- no money has
      // actually been collected at the moment a resident profile is
      // created. It only ever changes via a real payment through
      // POST /payments (recomputeResidentLedger), never a raw number
      // written directly onto this record -- see the PATCH handler in
      // residents/[id].js for why that used to be a real bug (a "fix"
      // typed here could silently revert itself later with no payment
      // trail to show for it).
      ['agreement_signed', agreement_signed ? 1 : 0],
      ['police_verification_status', police_verification_status || 'pending'],
      ['notes', notes || null],
    ];
    // Columns from newer migrations -- may not exist yet on every deployment.
    // Sent optimistically; any that turn out missing get dropped one at a
    // time and the insert retried, instead of a bare two-tier fallback that
    // would drop unrelated newer columns just because ONE of them is missing.
    const optionalFields = [
      ['aadhaar_photo_url', aadhaar_photo_url || null],
      ['aadhaar_back_photo_url', aadhaar_back_photo_url || null],
      ['pan_number', pan_number || null], ['pan_photo_url', pan_photo_url || null],
      ['id_proof_photo_url', id_proof_photo_url || null],
      ['passport_photo_url', passport_photo_url || null],
      ['custom_rent', custom_rent || null], ['custom_advance', custom_advance || null],
      ['first_month_due_option', first_month_due_option || null],
    ];

    let fields = [...baseFields, ...optionalFields];
    let result;
    for (let attempt = 0; ; attempt++) {
      const cols = fields.map(([c]) => c);
      const vals = fields.map(([, v]) => v);
      try {
        result = await env.DB.prepare(
          `INSERT INTO residents (${cols.join(', ')}, status) VALUES (${cols.map(() => '?').join(', ')}, 'active')`
        ).bind(...vals).run();
        break;
      } catch (e) {
        const msg = String((e && e.message) || e);
        const match = msg.match(/no such column:\s*(\w+)/i) || msg.match(/has no column named[: ]?(\w+)/i);
        if (!match || attempt > optionalFields.length) {
          // Not a missing-column error (or we've already retried once per
          // optional column and it's still failing) -- surface the real
          // error instead of a bare, undiagnosable 500.
          return jsonResponse({ error: 'Could not save resident: ' + msg }, 500);
        }
        const missingCol = match[1];
        const before = fields.length;
        fields = fields.filter(([c]) => c !== missingCol);
        if (fields.length === before) {
          // Couldn't identify the column to drop -- avoid looping forever.
          return jsonResponse({ error: 'Could not save resident: ' + msg }, 500);
        }
      }
    }

    const newResidentId = result.meta.last_row_id;

    return jsonResponse({ success: true, id: newResidentId });
  } catch (e) {
    return jsonResponse({ error: 'Unexpected error saving resident: ' + String((e && e.message) || e) }, 500);
  }
}
