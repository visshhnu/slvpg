-- migrations/0013_staff_multi_pg.sql
-- Lets one staff login be assigned to more than one PG (e.g. a manager who
-- covers two properties). staff.pg_id stays exactly as it was -- the
-- "primary" PG, unchanged for every existing single-PG staff row (zero rows
-- here means "just their one pg_id", same as before this migration existed).
-- staff_pgs holds the FULL set of assigned PGs for anyone with more than
-- one; functions/api/login.js unions staff.pg_id with this table at login
-- time to build the session's full pgIds list.
CREATE TABLE IF NOT EXISTS staff_pgs (
  staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  pg_id INTEGER NOT NULL REFERENCES pgs(id) ON DELETE CASCADE,
  PRIMARY KEY (staff_id, pg_id)
);
