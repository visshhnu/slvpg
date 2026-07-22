// functions/api/checkin-receipts/[id].js
// Deliberately has NO PATCH or DELETE handler -- once a receipt is generated
// it is permanent. If something about the original was wrong, generate a new
// receipt; the old one stays on record exactly as it was created.
import { requireAuth, jsonResponse, unauthorized, isPgAllowed } from '../../_auth.js';

export async function onRequestGet({ request, env, params }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const receipt = await env.DB.prepare(`
    SELECT cr.*, res.name as resident_name, res.phone as resident_phone, res.aadhaar_number
    FROM checkin_receipts cr
    LEFT JOIN residents res ON res.id = cr.resident_id
    WHERE cr.id = ?
  `).bind(params.id).first();

  if (!receipt) return jsonResponse({ error: 'Not found' }, 404);
  if (!isPgAllowed(session, receipt.pg_id)) return unauthorized();

  return jsonResponse({
    ...receipt,
    room_condition_snapshot: JSON.parse(receipt.room_condition_snapshot),
  });
}
