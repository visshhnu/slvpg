// functions/api/rooms.js
import { requireAuth, jsonResponse, unauthorized, resolvePgId } from '../_auth.js';

export async function onRequestGet({ request, env }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const pgId = resolvePgId(session, url);
  if (!pgId) return jsonResponse({ error: 'pg_id is required' }, 400);

  const { results } = await env.DB.prepare(`
    SELECT
      r.id as room_id, r.floor, r.room_number, r.sharing_type, r.capacity,
      r.monthly_rent, r.advance_deposit, r.refundable_amount, r.notes,
      r.needs_maintenance, r.maintenance_note,
      b.id as bed_id, b.bed_label,
      res.id as resident_id, res.name as resident_name, res.phone as resident_phone,
      res.status as resident_status
    FROM rooms r
    JOIN beds b ON b.room_id = r.id
    LEFT JOIN residents res ON res.bed_id = b.id AND res.status != 'vacated'
    WHERE r.pg_id = ?
    ORDER BY
      CASE r.floor
        WHEN 'Ground' THEN 0 WHEN '1st' THEN 1 WHEN '2nd' THEN 2
        WHEN '3rd' THEN 3 WHEN '4th' THEN 4 WHEN '5th' THEN 5 WHEN '6th' THEN 6
        ELSE 99 END,
      r.room_number, b.bed_label
  `).bind(pgId).all();

  const roomsMap = new Map();
  for (const row of results) {
    if (!roomsMap.has(row.room_id)) {
      roomsMap.set(row.room_id, {
        id: row.room_id,
        floor: row.floor,
        room_number: row.room_number,
        sharing_type: row.sharing_type,
        capacity: row.capacity,
        monthly_rent: row.monthly_rent,
        advance_deposit: row.advance_deposit,
        refundable_amount: row.refundable_amount,
        notes: row.notes,
        needs_maintenance: !!row.needs_maintenance,
        maintenance_note: row.maintenance_note,
        beds: [],
      });
    }
    roomsMap.get(row.room_id).beds.push({
      id: row.bed_id,
      label: row.bed_label,
      occupied: !!row.resident_id,
      resident: row.resident_id ? {
        id: row.resident_id,
        name: row.resident_name,
        phone: row.resident_phone,
        status: row.resident_status,
      } : null,
    });
  }

  return jsonResponse(Array.from(roomsMap.values()));
}

export async function onRequestPost({ request, env }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const pgId = resolvePgId(session, url);
  if (!pgId) return jsonResponse({ error: 'pg_id is required' }, 400);

  const { floor, room_number, sharing_type, capacity, monthly_rent, advance_deposit, refundable_amount, notes } = await request.json();
  if (!floor || !room_number || !sharing_type || !capacity || !monthly_rent) {
    return jsonResponse({ error: 'Missing required room fields' }, 400);
  }

  const result = await env.DB.prepare(
    `INSERT INTO rooms (pg_id, floor, room_number, sharing_type, capacity, monthly_rent, advance_deposit, refundable_amount, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(pgId, floor, room_number, sharing_type, capacity, monthly_rent, advance_deposit || 0, refundable_amount || 0, notes || null).run();

  const roomId = result.meta.last_row_id;
  const bedLabels = ['A', 'B', 'C'];
  for (let i = 0; i < capacity; i++) {
    await env.DB.prepare("INSERT INTO beds (room_id, bed_label) VALUES (?, ?)").bind(roomId, bedLabels[i]).run();
  }

  // Standard facility checklist, same as the seed data
  const standardItems = [
    ['Bed', capacity], ['Mattress', capacity], ['Pillow', capacity], ['Cupboard', capacity],
    ['Chair', capacity], ['Study Table', capacity], ['Fan', 1], ['Geyser', 1],
    ['Light', 2], ['Bucket', capacity], ['Mug', capacity], ['Attached Bathroom', 1],
  ];
  for (const [item, qty] of standardItems) {
    await env.DB.prepare('INSERT INTO room_facilities (room_id, item_name, quantity) VALUES (?, ?, ?)').bind(roomId, item, qty).run();
  }

  return jsonResponse({ success: true, id: roomId });
}
