// functions/_rent.js
// Shared helper: make sure every active resident has a rent_ledger row for `month`.
// Used by rent.js, dashboard.js, residents.js so all three always agree on totals.

export async function ensureLedgerRows(env, pgId, month) {
  const { results: activeResidents } = await env.DB.prepare(`
    SELECT res.id, res.custom_rent, r.monthly_rent
    FROM residents res
    JOIN beds b ON b.id = res.bed_id
    JOIN rooms r ON r.id = b.room_id
    WHERE res.pg_id = ? AND res.status IN ('active', 'notice_given')
  `).bind(pgId).all();

  const dueDate = `${month}-05`;

  for (const res of activeResidents) {
    const exists = await env.DB.prepare(
      'SELECT id FROM rent_ledger WHERE resident_id = ? AND month = ?'
    ).bind(res.id, month).first();

    if (!exists) {
      // custom_rent (per-bed override) wins over the room's shared monthly_rent
      const amount = res.custom_rent != null ? res.custom_rent : res.monthly_rent;
      await env.DB.prepare(
        `INSERT INTO rent_ledger (pg_id, resident_id, month, due_date, amount_due, status)
         VALUES (?, ?, ?, ?, ?, 'pending')`
      ).bind(pgId, res.id, month, dueDate, amount).run();
    }
  }
}
