// functions/api/property/[slug].js
// PUBLIC endpoint — no auth required. Returns property info for the shareable page.
import { jsonResponse } from '../../_auth.js';

export async function onRequestGet({ env, params }) {
  const pgId = parseInt(params.slug, 10);
  if (!pgId) return jsonResponse({ error: 'Not found' }, 404);

  const pg = await env.DB.prepare(
    `SELECT id, name, tagline, description, address, contact_phone,
            amenities, house_rules, photos,
            single_rent, double_rent, triple_rent,
            single_advance, double_advance, triple_advance,
            property_page_enabled
     FROM pgs WHERE id = ?`
  ).bind(pgId).first();

  if (!pg) return jsonResponse({ error: 'Not found' }, 404);

  // Graceful fallback if migration 0005 not yet applied
  const pageEnabled = pg.property_page_enabled ?? 0;
  if (!pageEnabled) return jsonResponse({ error: 'Property page not published yet' }, 404);

  const { results: availability } = await env.DB.prepare(`
    SELECT
      r.sharing_type,
      COUNT(*) as total_beds,
      SUM(CASE WHEN res.id IS NULL THEN 1 ELSE 0 END) as available_beds
    FROM beds b
    JOIN rooms r ON r.id = b.room_id
    LEFT JOIN residents res ON res.bed_id = b.id AND res.status != 'vacated'
    WHERE r.pg_id = ?
    GROUP BY r.sharing_type
  `).bind(pgId).all();

  return jsonResponse({
    id: pg.id,
    name: pg.name,
    tagline: pg.tagline || null,
    description: pg.description || null,
    address: pg.address || null,
    contact_phone: pg.contact_phone || null,
    amenities: pg.amenities ? JSON.parse(pg.amenities) : [],
    house_rules: pg.house_rules ? JSON.parse(pg.house_rules) : [],
    photos: pg.photos ? JSON.parse(pg.photos) : [],
    pricing: {
      single: pg.single_rent ? { rent: pg.single_rent, advance: pg.single_advance } : null,
      double: pg.double_rent ? { rent: pg.double_rent, advance: pg.double_advance } : null,
      triple: pg.triple_rent ? { rent: pg.triple_rent, advance: pg.triple_advance } : null,
    },
    availability,
  });
}
