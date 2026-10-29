-- RF metadata in the fixed schema shape: fills every field 900 and 901 leave out
-- with its default from schema/metadata.schema.json; existing values win.
-- Apply after 901: psql "$DATA_SOURCE_NAME" -f sql_mock/902_rf_metadata_defaults.sql
BEGIN;
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
UPDATE parts SET metadata = '{"category":null,"manufacturer":null,"country_of_origin":null,"notes":null,"temperature_stage":null,"image_urls":null,"specification":{}}'::jsonb || metadata
WHERE sku LIKE 'RF-%';
UPDATE inventory_items i SET metadata = '{"category":null,"manufacturer":null,"country_of_origin":null,"notes":null,"temperature_stage":null,"image_urls":null,"specification":{}}'::jsonb || i.metadata
FROM parts p WHERE p.id = i.part_id AND p.sku LIKE 'RF-%';
COMMIT;
