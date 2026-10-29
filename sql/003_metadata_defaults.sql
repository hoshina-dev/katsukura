-- Metadata now has a fixed shape (schema/metadata.schema.json): every field is
-- required. Backfill missing fields with their schema defaults (existing values
-- win) and make those defaults the column default, so direct SQL inserts that
-- omit metadata still match the schema.
ALTER TABLE parts ALTER COLUMN metadata SET DEFAULT '{"category":null,"manufacturer":null,"country_of_origin":null,"notes":null,"temperature_stage":null,"image_urls":null,"specification":{}}';
ALTER TABLE inventory_items ALTER COLUMN metadata SET DEFAULT '{"category":null,"manufacturer":null,"country_of_origin":null,"notes":null,"temperature_stage":null,"image_urls":null,"specification":{}}';

UPDATE parts SET metadata = '{"category":null,"manufacturer":null,"country_of_origin":null,"notes":null,"temperature_stage":null,"image_urls":null,"specification":{}}'::jsonb || metadata;
UPDATE inventory_items SET metadata = '{"category":null,"manufacturer":null,"country_of_origin":null,"notes":null,"temperature_stage":null,"image_urls":null,"specification":{}}'::jsonb || metadata;
