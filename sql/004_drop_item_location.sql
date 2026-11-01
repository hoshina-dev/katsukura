-- Item location was a free-text note with no behaviour behind it; dropped.
ALTER TABLE inventory_items DROP COLUMN IF EXISTS location;
