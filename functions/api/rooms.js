// functions/api/rooms.js
import { requireAuth, jsonResponse, unauthorized } from '../_auth.js';

export async function onRequestGet({ request, env }) {
  const session = await requireAuth(request, env);
  if (!session) return unauthorized();

  const { results } = await env.DB.prepare(`
    SELECT
      r.id as room_id, r.floor, r.room_number, r.sharing_type, r.capacity,
      r.monthly_rent, r.advance_deposit, r.refundable_amount, r.notes,
      b.id as bed_id, b.bed_label,
      res.id as resident_id, res.name as resident_name, res.phone as resident_phone,
      res.status as resident_status
    FROM rooms r
    JOIN beds b ON b.room_id = r.id
    LEFT JOIN residents res ON res.bed_id = b.id AND res.status != 'vacated'
    ORDER BY
      CASE r.floor
        WHEN 'Ground' THEN 0 WHEN '1st' THEN 1 WHEN '2nd' THEN 2
        WHEN '3rd' THEN 3 WHEN '4th' THEN 4 WHEN '5th' THEN 5 WHEN '6th' THEN 6
        ELSE 99 END,
      r.room_number, b.bed_label
  `).all();

  // Group beds under their room
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

  const { floor, room_number, sharing_type, capacity, monthly_rent, advance_deposit, refundable_amount, notes } = await request.json();
  if (!floor || !room_number || !sharing_type || !capacity || !monthly_rent) {
    return jsonResponse({ error: 'Missing required room fields' }, 400);
  }

  const result = await env.DB.prepare(
    `INSERT INTO rooms (floor, room_number, sharing_type, capacity, monthly_rent, advance_deposit, refundable_amount, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(floor, room_number, sharing_type, capacity, monthly_rent, advance_deposit || 0, refundable_amount || 0, notes || null).run();

  const roomId = result.meta.last_row_id;
  await env.DB.prepare("INSERT INTO beds (room_id, bed_label) VALUES (?, 'A')").bind(roomId).run();
  if (capacity === 2) {
    await env.DB.prepare("INSERT INTO beds (room_id, bed_label) VALUES (?, 'B')").bind(roomId).run();
  }

  return jsonResponse({ success: true, id: roomId });
}
