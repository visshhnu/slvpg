-- migrations/0011_custom_advance.sql
-- Per-bed advance override, mirroring custom_rent (migration 0007). If
-- NULL, the resident uses the room's shared advance_deposit (old
-- behaviour, unchanged). If set, it overrides the room rate for that one
-- resident only -- e.g. two beds in the same room can have different
-- advance targets, same as they already can for rent.
ALTER TABLE residents ADD COLUMN custom_advance INTEGER;
