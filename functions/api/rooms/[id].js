// functions/api/rooms/[id].js
import { requireAuth, jsonResponse, unauthorized, isPgAllowed } from '../../_auth.js';
import { syncCurrentMonthRent } from '../../_ledger.js';

export async function onRequestGet({ request, env, params }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const room = await env.DB.prepare('SELECT * FROM rooms WHERE id = ?').bind(params.id).first();
  if (!room) return jsonResponse({ error: 'Not found' }, 404);
  if (!isPgAllowed(session, room.pg_id)) return unauthorized();

  const { results: facilities } = await env.DB.prepare(
    'SELECT * FROM room_facilities WHERE room_id = ? ORDER BY id'
  ).bind(params.id).all();

  return jsonResponse({ ...room, facilities });
}

export async function onRequestPatch({ request, env, params }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const room = await env.DB.prepare('SELECT * FROM rooms WHERE id = ?').bind(params.id).first();
  if (!room) return jsonResponse({ error: 'Not found' }, 404);
  if (!isPgAllowed(session, room.pg_id)) return unauthorized();

  const body = await request.json();

  // Handle a sharing/capacity change specially: it needs to add or remove beds safely.
  if ('capacity' in body && body.capacity !== room.capacity) {
    const newCapacity = parseInt(body.capacity, 10);
    if (![1, 2, 3].includes(newCapacity)) {
      return jsonResponse({ error: 'Capacity must be 1, 2, or 3' }, 400);
    }

    const { results: existingBeds } = await env.DB.prepare(
      'SELECT b.id, b.bed_label, res.id as resident_id, res.name as resident_name FROM beds b LEFT JOIN residents res ON res.bed_id = b.id AND res.status != \'vacated\' WHERE b.room_id = ? ORDER BY b.bed_label'
    ).bind(params.id).all();

    if (newCapacity < existingBeds.length) {
      // Shrinking: every bed being removed must be empty first.
      const bedsToRemove = existingBeds.slice(newCapacity);
      const occupiedAmongRemoved = bedsToRemove.filter(b => b.resident_id);
      if (occupiedAmongRemoved.length > 0) {
        const names = occupiedAmongRemoved.map(b => b.resident_name).join(', ');
        return jsonResponse({
          error: `Can't reduce sharing while ${names} still occupies a bed here. Move or vacate them first.`
        }, 409);
      }
      for (const bed of bedsToRemove) {
        await env.DB.prepare('DELETE FROM beds WHERE id = ?').bind(bed.id).run();
      }
    } else if (newCapacity > existingBeds.length) {
      // Growing: add new lettered beds (C, D, ...) after whatever already exists.
      const labels = ['A', 'B', 'C'];
      for (let i = existingBeds.length; i < newCapacity; i++) {
        await env.DB.prepare("INSERT INTO beds (room_id, bed_label) VALUES (?, ?)").bind(params.id, labels[i]).run();
      }
      // Extend the facility checklist proportionally for per-bed items.
      const perBedItems = ['Bed', 'Mattress', 'Pillow', 'Cupboard', 'Chair', 'Study Table', 'Bucket', 'Mug'];
      for (const item of perBedItems) {
        const existing = await env.DB.prepare(
          'SELECT id, quantity FROM room_facilities WHERE room_id = ? AND item_name = ?'
        ).bind(params.id, item).first();
        if (existing) {
          await env.DB.prepare('UPDATE room_facilities SET quantity = ? WHERE id = ?').bind(newCapacity, existing.id).run();
        }
      }
    }

    // Auto-derive a sensible sharing_type label unless one was explicitly provided too.
    if (!('sharing_type' in body)) {
      body.sharing_type = newCapacity === 1 ? 'single' : newCapacity === 2 ? 'double' : 'triple';
    }
  }

  const allowed = ['monthly_rent', 'advance_deposit', 'refundable_amount', 'sharing_type', 'capacity', 'needs_maintenance', 'maintenance_note', 'notes'];
  const updates = [];
  const binds = [];
  for (const field of allowed) {
    if (field in body) {
      updates.push(`${field} = ?`);
      binds.push(field === 'needs_maintenance' ? (body[field] ? 1 : 0) : body[field]);
    }
  }
  if (updates.length === 0) return jsonResponse({ error: 'No valid fields to update' }, 400);

  binds.push(params.id);
  await env.DB.prepare(`UPDATE rooms SET ${updates.join(', ')} WHERE id = ?`).bind(...binds).run();

  // If the rent just changed, every resident currently in this room (who
  // doesn't have their own custom_rent override) has a stale current-month
  // rent_ledger row -- self-heal all of them right now rather than waiting
  // for the next unrelated page load to trigger ensureLedgerRows.
  if ('monthly_rent' in body) {
    const { results: occupants } = await env.DB.prepare(`
      SELECT res.id FROM residents res
      JOIN beds b ON b.id = res.bed_id
      WHERE b.room_id = ? AND res.status IN ('active', 'notice_given')
    `).bind(params.id).all();
    for (const occ of occupants) {
      await syncCurrentMonthRent(env, occ.id);
    }
  }

  return jsonResponse({ success: true });
}
