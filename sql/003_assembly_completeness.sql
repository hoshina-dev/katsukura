-- Assembly completeness and public visibility.
-- Kept apart from the structural checks (cycles, slot SKUs, quantity caps) in
-- 001 and their incremental rewrite; it does not depend on either. Safe to re-run.
--
-- An item is "ready" when it is complete or its SKU has no BOM. A complete,
-- non-archived item must have every required slot filled to its quantity, and
-- every installed child must be ready. The API demotes items that a change
-- would break; this check rejects anything that is still inconsistent.

-- Complete items among ids (NULL = all) that break the rule above
CREATE OR REPLACE FUNCTION papi2_incomplete_assemblies(ids uuid[]) RETURNS SETOF uuid LANGUAGE sql STABLE AS $$
    SELECT i.id FROM inventory_items i
    WHERE (ids IS NULL OR i.id = ANY (ids))
      AND i.assembly_state = 'complete' AND i.archived_at IS NULL
      AND (
        EXISTS (
            SELECT 1 FROM part_components b
            WHERE b.parent_part_id = i.part_id AND NOT b.is_optional
              AND (SELECT count(*) FROM item_components c
                   WHERE c.parent_item_id = i.id AND c.part_component_id = b.id AND c.removed_at IS NULL)
                  < b.required_quantity
        ) OR EXISTS (
            SELECT 1 FROM item_components c JOIN inventory_items child ON child.id = c.component_item_id
            WHERE c.parent_item_id = i.id AND c.removed_at IS NULL AND child.assembly_state <> 'complete'
              AND EXISTS (SELECT 1 FROM part_components b WHERE b.parent_part_id = child.part_id)
        )
      )
$$;

-- Checks only the items a row change can affect
CREATE OR REPLACE FUNCTION papi2_validate_assemblies() RETURNS trigger LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    ids uuid[];
BEGIN
    IF TG_TABLE_NAME = 'inventory_items' THEN
        ids := ARRAY[NEW.id] || ARRAY(
            SELECT parent_item_id FROM item_components WHERE component_item_id = NEW.id AND removed_at IS NULL);
    ELSIF TG_TABLE_NAME = 'item_components' THEN
        ids := ARRAY[NEW.parent_item_id];
    ELSE
        ids := ARRAY(SELECT id FROM inventory_items WHERE part_id = NEW.parent_part_id);
    END IF;
    IF EXISTS (SELECT 1 FROM papi2_incomplete_assemblies(ids)) THEN
        RAISE EXCEPTION 'complete item is missing components' USING ERRCODE = '23514', CONSTRAINT = 'papi2_assembly_complete';
    END IF;
    RETURN NULL;
END;
$$;

DO $$
DECLARE
    table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY['inventory_items', 'item_components', 'part_components'] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS validate_assemblies ON %I', table_name);
        EXECUTE format('CREATE CONSTRAINT TRIGGER validate_assemblies AFTER INSERT OR UPDATE ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION papi2_validate_assemblies()', table_name);
    END LOOP;
END;
$$;

-- Public stock: not archived, not installed anywhere, and ready
CREATE OR REPLACE FUNCTION papi2_item_listed(item_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT i.archived_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM item_components c WHERE c.component_item_id = i.id AND c.removed_at IS NULL)
       AND (i.assembly_state = 'complete' OR NOT EXISTS (SELECT 1 FROM part_components b WHERE b.parent_part_id = i.part_id))
    FROM inventory_items i WHERE i.id = item_id
$$;

-- Public item page: the item's top-level ancestor (or the item itself) is listed
CREATE OR REPLACE FUNCTION papi2_item_viewable(item_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
    WITH RECURSIVE chain(id) AS (
        SELECT item_id
        UNION
        SELECT c.parent_item_id FROM chain JOIN item_components c ON c.component_item_id = chain.id AND c.removed_at IS NULL
    )
    SELECT COALESCE(bool_or(papi2_item_listed(chain.id)), false) FROM chain
    WHERE NOT EXISTS (SELECT 1 FROM item_components c WHERE c.component_item_id = chain.id AND c.removed_at IS NULL)
$$;

-- Existing data: demote complete items that already break the rule, bottom-up
DO $$
BEGIN
    LOOP
        UPDATE inventory_items SET assembly_state = 'draft' WHERE id IN (SELECT papi2_incomplete_assemblies(NULL));
        EXIT WHEN NOT FOUND;
    END LOOP;
END;
$$;
