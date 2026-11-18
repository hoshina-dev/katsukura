-- SKU prices: leaf parts store composite_price (default 0); assemblies keep the
-- stored column at 0 and resolve the total from their bill of materials.
-- unit_price is an optional override; when null the effective price is the
-- resolved composite price.

ALTER TABLE parts
    ADD COLUMN composite_price numeric(14, 2) NOT NULL DEFAULT 0
        CONSTRAINT parts_composite_price_non_negative CHECK (composite_price >= 0),
    ADD COLUMN unit_price numeric(14, 2)
        CONSTRAINT parts_unit_price_non_negative CHECK (unit_price IS NULL OR unit_price >= 0);

-- Resolved composite price: stored value for a leaf, otherwise the sum of
-- required_quantity * child composite over every direct BOM row.
CREATE OR REPLACE FUNCTION part_composite_price(p_part uuid) RETURNS numeric(14, 2)
LANGUAGE plpgsql STABLE AS $$
DECLARE
    has_children boolean;
    total numeric(14, 2);
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM part_components WHERE parent_part_id = p_part
    ) INTO has_children;
    IF NOT has_children THEN
        RETURN COALESCE((SELECT composite_price FROM parts WHERE id = p_part), 0);
    END IF;
    SELECT COALESCE(sum(c.required_quantity * part_composite_price(c.child_part_id)), 0)
      INTO total
      FROM part_components c
     WHERE c.parent_part_id = p_part;
    RETURN total;
END;
$$;

-- Assemblies must keep the stored composite_price at 0; the resolved value
-- comes from part_composite_price().
CREATE OR REPLACE FUNCTION papi2_assert_leaf_composite_price(p_part uuid)
RETURNS void LANGUAGE plpgsql VOLATILE AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM parts p
        WHERE p.id = p_part
          AND p.composite_price <> 0
          AND EXISTS (SELECT 1 FROM part_components c WHERE c.parent_part_id = p.id)
    ) THEN
        RAISE EXCEPTION 'composite price only on parts without a bill of materials'
            USING ERRCODE = '23514', CONSTRAINT = 'papi2_leaf_composite_price';
    END IF;
END;
$$;

-- Adding a BOM row demotes the parent to an assembly: clear any leaf price so
-- the deferred check passes in the same transaction.
CREATE OR REPLACE FUNCTION papi2_clear_parent_composite_price() RETURNS trigger
LANGUAGE plpgsql VOLATILE AS $$
BEGIN
    UPDATE parts
       SET composite_price = 0, updated_at = now()
     WHERE id = NEW.parent_part_id AND composite_price <> 0;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION papi2_validate_part_composite_price() RETURNS trigger
LANGUAGE plpgsql VOLATILE AS $$
BEGIN
    PERFORM papi2_assert_leaf_composite_price(NEW.id);
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION papi2_validate_parent_composite_price() RETURNS trigger
LANGUAGE plpgsql VOLATILE AS $$
BEGIN
    PERFORM papi2_assert_leaf_composite_price(NEW.parent_part_id);
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS clear_parent_composite_price ON part_components;
CREATE TRIGGER clear_parent_composite_price BEFORE INSERT ON part_components
    FOR EACH ROW EXECUTE FUNCTION papi2_clear_parent_composite_price();

DROP TRIGGER IF EXISTS validate_part_composite_price ON parts;
CREATE CONSTRAINT TRIGGER validate_part_composite_price AFTER UPDATE ON parts
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
    WHEN (NEW.composite_price IS DISTINCT FROM OLD.composite_price)
    EXECUTE FUNCTION papi2_validate_part_composite_price();

DROP TRIGGER IF EXISTS validate_parent_composite_price ON part_components;
CREATE CONSTRAINT TRIGGER validate_parent_composite_price AFTER INSERT ON part_components
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
    EXECUTE FUNCTION papi2_validate_parent_composite_price();

-- Extend the whole-graph audit with the new invariant.
CREATE OR REPLACE FUNCTION papi2_audit_structure() RETURNS SETOF text LANGUAGE plpgsql VOLATILE AS $$
BEGIN
    IF EXISTS (
        WITH RECURSIVE reach(start_id, node_id) AS (
            SELECT parent_part_id, child_part_id FROM part_components
            UNION
            SELECT r.start_id, c.child_part_id FROM reach r JOIN part_components c ON c.parent_part_id = r.node_id
        ) SELECT 1 FROM reach WHERE start_id = node_id
    ) THEN RETURN NEXT 'papi2_bom_cycle'; END IF;
    IF EXISTS (
        WITH RECURSIVE reach(start_id, node_id) AS (
            SELECT parent_item_id, component_item_id FROM item_components WHERE removed_at IS NULL
            UNION
            SELECT r.start_id, c.component_item_id FROM reach r JOIN item_components c ON c.parent_item_id = r.node_id WHERE c.removed_at IS NULL
        ) SELECT 1 FROM reach WHERE start_id = node_id
    ) THEN RETURN NEXT 'papi2_item_cycle'; END IF;
    IF EXISTS (
        SELECT 1 FROM item_components c
        JOIN inventory_items p ON p.id = c.parent_item_id
        JOIN inventory_items child ON child.id = c.component_item_id
        JOIN part_components b ON b.id = c.part_component_id
        WHERE c.removed_at IS NULL AND (p.part_id <> b.parent_part_id OR child.part_id <> b.child_part_id)
    ) THEN RETURN NEXT 'papi2_slot_match'; END IF;
    IF EXISTS (
        SELECT 1 FROM item_components c JOIN part_components b ON b.id = c.part_component_id
        WHERE c.removed_at IS NULL GROUP BY c.parent_item_id, b.id, b.required_quantity
        HAVING count(*) > b.required_quantity
    ) THEN RETURN NEXT 'papi2_quantity_cap'; END IF;
    IF EXISTS (
        SELECT 1 FROM item_components c JOIN inventory_items p ON p.id = c.parent_item_id
        JOIN inventory_items child ON child.id = c.component_item_id
        WHERE c.removed_at IS NULL AND (p.archived_at IS NOT NULL OR child.archived_at IS NOT NULL)
    ) OR EXISTS (
        SELECT 1 FROM inventory_items i JOIN parts p ON p.id = i.part_id
        WHERE i.archived_at IS NULL AND p.archived_at IS NOT NULL
    ) THEN RETURN NEXT 'papi2_active_archived'; END IF;
    IF EXISTS (
        SELECT 1 FROM part_components c JOIN parts p ON p.id = c.parent_part_id
        JOIN parts child ON child.id = c.child_part_id
        WHERE p.archived_at IS NULL AND child.archived_at IS NOT NULL
    ) THEN RETURN NEXT 'papi2_part_archive_in_use'; END IF;
    IF EXISTS (
        SELECT 1 FROM parts p
        WHERE p.composite_price <> 0
          AND EXISTS (SELECT 1 FROM part_components c WHERE c.parent_part_id = p.id)
    ) THEN RETURN NEXT 'papi2_leaf_composite_price'; END IF;
    RETURN;
END;
$$;

DO $$
DECLARE function_signature text;
BEGIN
    FOREACH function_signature IN ARRAY ARRAY[
        'part_composite_price(uuid)',
        'papi2_assert_leaf_composite_price(uuid)',
        'papi2_clear_parent_composite_price()',
        'papi2_validate_part_composite_price()',
        'papi2_validate_parent_composite_price()',
        'papi2_audit_structure()'
    ] LOOP
        EXECUTE format('ALTER FUNCTION %s SET search_path = %I, pg_temp', function_signature, current_schema());
    END LOOP;
END;
$$;
