-- migrations/0008_pg_manager_role.sql
-- Adds a 'pg_manager' role that sits between 'staff' and 'admin':
-- locked to one PG (like staff) but can review and fix corrections,
-- edit payment type/amount, and delete wrong payments for that PG only.
-- No schema change needed — the role column already supports any text value.
-- This migration is a no-op SQL that just documents the intent; the actual
-- enforcement is in the API files updated in this same deployment.
SELECT 1; -- placeholder so wrangler registers this migration as applied
