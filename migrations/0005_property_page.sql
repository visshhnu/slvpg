-- Migration 0005: Public property page
-- Adds columns to pgs table for the shareable property listing page.
-- Safe additive migration — only adds columns, touches nothing else.

ALTER TABLE pgs ADD COLUMN tagline TEXT;
ALTER TABLE pgs ADD COLUMN description TEXT;
ALTER TABLE pgs ADD COLUMN amenities TEXT;        -- JSON array of amenity strings
ALTER TABLE pgs ADD COLUMN house_rules TEXT;      -- JSON array of rule strings
ALTER TABLE pgs ADD COLUMN photos TEXT;           -- JSON array of base64 data URLs
ALTER TABLE pgs ADD COLUMN property_page_enabled INTEGER NOT NULL DEFAULT 0;
-- single_rent, double_rent, triple_rent for display on the page
ALTER TABLE pgs ADD COLUMN single_rent INTEGER;
ALTER TABLE pgs ADD COLUMN double_rent INTEGER;
ALTER TABLE pgs ADD COLUMN triple_rent INTEGER;
ALTER TABLE pgs ADD COLUMN single_advance INTEGER;
ALTER TABLE pgs ADD COLUMN double_advance INTEGER;
ALTER TABLE pgs ADD COLUMN triple_advance INTEGER;
