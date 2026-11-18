-- Parts that do not track serial numbers (nuts, bolts, etc.) still create one
-- inventory row per unit; serial_number stays null. Choice is fixed at create.
ALTER TABLE parts ADD COLUMN serial_aware boolean NOT NULL DEFAULT true;
