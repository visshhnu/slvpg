-- migrations/0007_custom_rent_and_docs.sql
-- Two unrelated but small additive changes, bundled so there's only one
-- new migration file to apply.

-- 1) Per-bed rent override. If NULL, resident uses the room's shared
--    monthly_rent (old behaviour, unchanged). If set, it overrides the
--    room rate for that one resident only — this is what lets two beds
--    in the same room (e.g. ₹12,000 and ₹11,000) have different rent.
ALTER TABLE residents ADD COLUMN custom_rent INTEGER;

-- 2) ID document uploads were missing Aadhaar back side and a
--    passport/face photo. aadhaar_photo_url (front), pan_photo_url and
--    id_proof_photo_url already exist from migration 0004.
ALTER TABLE residents ADD COLUMN aadhaar_back_photo_url TEXT;
ALTER TABLE residents ADD COLUMN passport_photo_url TEXT;
