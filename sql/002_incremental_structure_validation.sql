-- Check for cycles by walking DOWN from the new child rather than UP from the new
-- parent. Because a cycle exists if and only if the parent is below
-- the child, equivalently the child is above the parent 
-- However, the typical edit attaches a small component to a large assembly, 
-- so the child's subtree is the smaller side. 

-- Read-only whole-graph audit. Same semantics as the retired
-- papi2_validate_structure(), but reports instead of raising. The equivalence
-- oracle for this refactor, the operator diagnostic after a trigger-disabled
-- restore, and the acceptance test for any future cycle-detection redesign.
-- Never called from a trigger.
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
    RETURN;
END;
$$;

-- Retire the whole-table validator. Triggers first: DROP FUNCTION fails while a
-- trigger still depends on it.
DO $$
DECLARE table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY['parts', 'part_components', 'inventory_items', 'item_components'] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS validate_structure ON %I', table_name);
    END LOOP;
END;
$$;
DROP FUNCTION IF EXISTS papi2_validate_structure();

-- Cycle detection lives behind exactly these two functions.

-- Single-source reachability, seeded at the one child node, never the whole table. 
CREATE OR REPLACE FUNCTION papi2_assert_bom_acyclic(p_parent uuid, p_child uuid)
RETURNS void LANGUAGE plpgsql VOLATILE AS $$
BEGIN
    IF p_parent = p_child THEN
        RAISE EXCEPTION 'BOM cycle' USING ERRCODE = '23514', CONSTRAINT = 'papi2_bom_cycle';
    END IF;
    IF EXISTS (
        WITH RECURSIVE descendants(node_id) AS (
            SELECT p_child
            UNION
            SELECT c.child_part_id FROM part_components c JOIN descendants d ON c.parent_part_id = d.node_id
        )
        SELECT 1 FROM descendants WHERE node_id = p_parent LIMIT 1
    ) THEN
        RAISE EXCEPTION 'BOM cycle' USING ERRCODE = '23514', CONSTRAINT = 'papi2_bom_cycle';
    END IF;
END;
$$;

-- Note: this check on item_components is unreachable through legal writes. An active edge
-- item_i(part X) -> item_j(part Y) requires a part_components edge X->Y, 
-- so an ownership cycle implies a BOM cycle, which papi2_assert_bom_acyclic already blocks.
-- It is defense-in-depth against data loaded with triggers disabled.
CREATE OR REPLACE FUNCTION papi2_assert_item_acyclic(p_parent_item uuid, p_component_item uuid)
RETURNS void LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    ancestor uuid := p_parent_item;
    steps integer := 0;
    max_depth constant integer := 1000;
BEGIN
    LOOP
        IF ancestor = p_component_item THEN
            RAISE EXCEPTION 'ownership cycle' USING ERRCODE = '23514', CONSTRAINT = 'papi2_item_cycle';
        END IF;
        steps := steps + 1;
        IF steps > max_depth THEN
            RAISE EXCEPTION 'ownership chain exceeds % levels; stored ownership graph is not a forest', max_depth
                USING ERRCODE = '23514', CONSTRAINT = 'papi2_item_cycle';
        END IF;
        SELECT c.parent_item_id INTO ancestor
        FROM item_components c
        WHERE c.component_item_id = ancestor AND c.removed_at IS NULL;
        IF NOT FOUND THEN
            RETURN;
        END IF;
    END LOOP;
END;
$$;

-- I3 scoped to one installation. All four lookups are primary keys.
CREATE OR REPLACE FUNCTION papi2_assert_slot_match(p_installation uuid)
RETURNS void LANGUAGE plpgsql VOLATILE AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM item_components c
        JOIN inventory_items parent ON parent.id = c.parent_item_id
        JOIN inventory_items child ON child.id = c.component_item_id
        JOIN part_components b ON b.id = c.part_component_id
        WHERE c.id = p_installation AND c.removed_at IS NULL
          AND (parent.part_id <> b.parent_part_id OR child.part_id <> b.child_part_id)
    ) THEN
        RAISE EXCEPTION 'installation must match exact BOM SKU' USING ERRCODE = '23514', CONSTRAINT = 'papi2_slot_match';
    END IF;
END;
$$;

-- I3 scoped to one BOM slot. Defensive only: a child_part_id change on a
-- referenced slot already fails 23503 on the composite FK to
-- part_components(id, parent_part_id, child_part_id). Index: item_components_bom.
CREATE OR REPLACE FUNCTION papi2_assert_slot_match_for_slot(p_part_component uuid)
RETURNS void LANGUAGE plpgsql VOLATILE AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM item_components c
        JOIN inventory_items parent ON parent.id = c.parent_item_id
        JOIN inventory_items child ON child.id = c.component_item_id
        JOIN part_components b ON b.id = c.part_component_id
        WHERE c.part_component_id = p_part_component AND c.removed_at IS NULL
          AND (parent.part_id <> b.parent_part_id OR child.part_id <> b.child_part_id)
    ) THEN
        RAISE EXCEPTION 'installation must match exact BOM SKU' USING ERRCODE = '23514', CONSTRAINT = 'papi2_slot_match';
    END IF;
END;
$$;

-- I4 scoped to one (parent item, BOM slot) pair. required_quantity is re-read
-- from the table, never taken from a captured NEW. Index:
-- item_components_active_slot (parent_item_id, part_component_id)
-- WHERE removed_at IS NULL -- an index-only count of exactly the active rows of
-- this one slot on this one parent.
CREATE OR REPLACE FUNCTION papi2_assert_quantity_cap(p_parent_item uuid, p_part_component uuid)
RETURNS void LANGUAGE plpgsql VOLATILE AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM part_components b
        WHERE b.id = p_part_component
          AND (SELECT count(*) FROM item_components c
                WHERE c.parent_item_id = p_parent_item
                  AND c.part_component_id = p_part_component
                  AND c.removed_at IS NULL) > b.required_quantity
    ) THEN
        RAISE EXCEPTION 'slot quantity exceeded' USING ERRCODE = '23514', CONSTRAINT = 'papi2_quantity_cap';
    END IF;
END;
$$;

-- I4 scoped to one BOM slot across every parent that uses it. Needed when
-- required_quantity is lowered. Index: item_components_bom. If the slot was
-- deleted later in the same transaction the scalar subquery is NULL, HAVING
-- yields no rows, and the check passes -- correct, because a deleted slot has no
-- cap, and FK RESTRICT would have blocked the delete if any installation
-- referenced it.
CREATE OR REPLACE FUNCTION papi2_assert_quantity_cap_for_slot(p_part_component uuid)
RETURNS void LANGUAGE plpgsql VOLATILE AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM item_components c
        WHERE c.part_component_id = p_part_component AND c.removed_at IS NULL
        GROUP BY c.parent_item_id
        HAVING count(*) > (SELECT b.required_quantity FROM part_components b WHERE b.id = p_part_component)
    ) THEN
        RAISE EXCEPTION 'slot quantity exceeded' USING ERRCODE = '23514', CONSTRAINT = 'papi2_quantity_cap';
    END IF;
END;
$$;

-- I5a + I5b scoped to one inventory item. Re-reads current archived_at, so one
-- function covers archive and restore in both directions. Indexes:
-- item_components_one_active_parent for the active-parent probe,
-- item_components_active_slot (leading column parent_item_id, partial on
-- removed_at IS NULL) for the active-children probe.
CREATE OR REPLACE FUNCTION papi2_assert_item_archive_coherent(p_item uuid)
RETURNS void LANGUAGE plpgsql VOLATILE AS $$
DECLARE item_archived boolean; part_archived boolean;
BEGIN
    SELECT i.archived_at IS NOT NULL, p.archived_at IS NOT NULL
      INTO item_archived, part_archived
      FROM inventory_items i JOIN parts p ON p.id = i.part_id
     WHERE i.id = p_item;
    IF NOT FOUND THEN RETURN; END IF;
    IF item_archived AND (
           EXISTS (SELECT 1 FROM item_components c WHERE c.component_item_id = p_item AND c.removed_at IS NULL)
        OR EXISTS (SELECT 1 FROM item_components c WHERE c.parent_item_id = p_item AND c.removed_at IS NULL)
    ) THEN
        RAISE EXCEPTION 'archived entities are in active use' USING ERRCODE = '23514', CONSTRAINT = 'papi2_active_archived';
    END IF;
    IF NOT item_archived AND part_archived THEN
        RAISE EXCEPTION 'archived entities are in active use' USING ERRCODE = '23514', CONSTRAINT = 'papi2_active_archived';
    END IF;
END;
$$;

-- I5a scoped to one installation: an install into, or of, an archived item.
CREATE OR REPLACE FUNCTION papi2_assert_installation_archive_coherent(p_installation uuid)
RETURNS void LANGUAGE plpgsql VOLATILE AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM item_components c
        JOIN inventory_items parent ON parent.id = c.parent_item_id
        JOIN inventory_items child ON child.id = c.component_item_id
        WHERE c.id = p_installation AND c.removed_at IS NULL
          AND (parent.archived_at IS NOT NULL OR child.archived_at IS NOT NULL)
    ) THEN
        RAISE EXCEPTION 'archived entities are in active use' USING ERRCODE = '23514', CONSTRAINT = 'papi2_active_archived';
    END IF;
END;
$$;

-- I5b + I6 scoped to one part. Covers archive and restore in both directions.
-- Indexes: inventory_items UNIQUE (part_id, serial_number) -- leading column
-- part_id, and btrees index NULL serial numbers, so items with no serial are
-- reachable; UNIQUE (parent_part_id, slot) for "my archived children";
-- part_components_child for "my active parents". Written as separate EXISTS
-- rather than one OR so each disjunct gets its own deterministic index scan.
CREATE OR REPLACE FUNCTION papi2_assert_part_archive_coherent(p_part uuid)
RETURNS void LANGUAGE plpgsql VOLATILE AS $$
DECLARE part_archived boolean;
BEGIN
    SELECT p.archived_at IS NOT NULL INTO part_archived FROM parts p WHERE p.id = p_part;
    IF NOT FOUND THEN RETURN; END IF;
    IF part_archived AND EXISTS (
        SELECT 1 FROM inventory_items i WHERE i.part_id = p_part AND i.archived_at IS NULL
    ) THEN
        RAISE EXCEPTION 'archived entities are in active use' USING ERRCODE = '23514', CONSTRAINT = 'papi2_active_archived';
    END IF;
    IF NOT part_archived AND EXISTS (
        SELECT 1 FROM part_components c JOIN parts child ON child.id = c.child_part_id
        WHERE c.parent_part_id = p_part AND child.archived_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'archived SKU belongs to an active BOM' USING ERRCODE = '23514', CONSTRAINT = 'papi2_part_archive_in_use';
    END IF;
    IF part_archived AND EXISTS (
        SELECT 1 FROM part_components c JOIN parts parent ON parent.id = c.parent_part_id
        WHERE c.child_part_id = p_part AND parent.archived_at IS NULL
    ) THEN
        RAISE EXCEPTION 'archived SKU belongs to an active BOM' USING ERRCODE = '23514', CONSTRAINT = 'papi2_part_archive_in_use';
    END IF;
END;
$$;

-- Thin trigger functions, one per table role, so the check matrix is readable
-- from the schema rather than from a single branching megafunction.
CREATE OR REPLACE FUNCTION papi2_check_bom_cycle() RETURNS trigger LANGUAGE plpgsql VOLATILE AS $$
BEGIN
    PERFORM papi2_assert_bom_acyclic(NEW.parent_part_id, NEW.child_part_id);
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION papi2_check_item_cycle() RETURNS trigger LANGUAGE plpgsql VOLATILE AS $$
BEGIN
    PERFORM papi2_assert_item_acyclic(NEW.parent_item_id, NEW.component_item_id);
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION papi2_validate_part() RETURNS trigger LANGUAGE plpgsql VOLATILE AS $$
BEGIN
    PERFORM papi2_assert_part_archive_coherent(NEW.id);
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION papi2_validate_inventory_item() RETURNS trigger LANGUAGE plpgsql VOLATILE AS $$
BEGIN
    PERFORM papi2_assert_item_archive_coherent(NEW.id);
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION papi2_validate_part_component() RETURNS trigger LANGUAGE plpgsql VOLATILE AS $$
BEGIN
    PERFORM papi2_assert_quantity_cap_for_slot(NEW.id);
    PERFORM papi2_assert_slot_match_for_slot(NEW.id);
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION papi2_validate_item_component() RETURNS trigger LANGUAGE plpgsql VOLATILE AS $$
BEGIN
    PERFORM papi2_assert_slot_match(NEW.id);
    PERFORM papi2_assert_quantity_cap(NEW.parent_item_id, NEW.part_component_id);
    PERFORM papi2_assert_installation_archive_coherent(NEW.id);
    RETURN NULL;
END;
$$;

-- Immediate cycle probes. AFTER rather than BEFORE so a multi-row statement is
-- validated against its complete result. Plain AFTER ROW triggers, not constraint
-- triggers: a cycle never needs a transient violation.
DROP TRIGGER IF EXISTS check_bom_cycle_insert ON part_components;
CREATE TRIGGER check_bom_cycle_insert AFTER INSERT ON part_components
    FOR EACH ROW EXECUTE FUNCTION papi2_check_bom_cycle();

DROP TRIGGER IF EXISTS check_bom_cycle_update ON part_components;
CREATE TRIGGER check_bom_cycle_update AFTER UPDATE ON part_components
    FOR EACH ROW
    WHEN (NEW.child_part_id IS DISTINCT FROM OLD.child_part_id
          OR NEW.parent_part_id IS DISTINCT FROM OLD.parent_part_id)
    EXECUTE FUNCTION papi2_check_bom_cycle();

-- papi2_protect_rows already rejects an insert carrying removed_at, so every new
-- item_components row is active.
DROP TRIGGER IF EXISTS check_item_cycle_insert ON item_components;
CREATE TRIGGER check_item_cycle_insert AFTER INSERT ON item_components
    FOR EACH ROW EXECUTE FUNCTION papi2_check_item_cycle();

-- Deferred, row-scoped checks. For an AFTER trigger the WHEN condition is
-- evaluated at the time of the row change, so a gated-off event is never even
-- queued: a parts name or metadata PATCH now costs nothing at all.
DROP TRIGGER IF EXISTS validate_part_component ON part_components;
CREATE CONSTRAINT TRIGGER validate_part_component AFTER UPDATE ON part_components
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
    WHEN (NEW.required_quantity IS DISTINCT FROM OLD.required_quantity
          OR NEW.child_part_id IS DISTINCT FROM OLD.child_part_id)
    EXECUTE FUNCTION papi2_validate_part_component();

DROP TRIGGER IF EXISTS validate_item_component ON item_components;
CREATE CONSTRAINT TRIGGER validate_item_component AFTER INSERT ON item_components
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
    EXECUTE FUNCTION papi2_validate_item_component();

DROP TRIGGER IF EXISTS validate_part ON parts;
CREATE CONSTRAINT TRIGGER validate_part AFTER UPDATE ON parts
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
    WHEN (NEW.archived_at IS DISTINCT FROM OLD.archived_at)
    EXECUTE FUNCTION papi2_validate_part();

DROP TRIGGER IF EXISTS validate_inventory_item_insert ON inventory_items;
CREATE CONSTRAINT TRIGGER validate_inventory_item_insert AFTER INSERT ON inventory_items
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
    WHEN (NEW.archived_at IS NULL)
    EXECUTE FUNCTION papi2_validate_inventory_item();

DROP TRIGGER IF EXISTS validate_inventory_item_update ON inventory_items;
CREATE CONSTRAINT TRIGGER validate_inventory_item_update AFTER UPDATE ON inventory_items
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
    WHEN (NEW.archived_at IS DISTINCT FROM OLD.archived_at)
    EXECUTE FUNCTION papi2_validate_inventory_item();

-- Explicit pg_temp last prevents caller-created tables shadowing invariant
-- checks. %s for the signature (literals under our control); %I only for the
-- schema -- %I on a parenthesized signature would quote it as one identifier.
DO $$
DECLARE function_signature text;
BEGIN
    FOREACH function_signature IN ARRAY ARRAY[
        'papi2_audit_structure()',
        'papi2_assert_bom_acyclic(uuid,uuid)',
        'papi2_assert_item_acyclic(uuid,uuid)',
        'papi2_assert_slot_match(uuid)',
        'papi2_assert_slot_match_for_slot(uuid)',
        'papi2_assert_quantity_cap(uuid,uuid)',
        'papi2_assert_quantity_cap_for_slot(uuid)',
        'papi2_assert_item_archive_coherent(uuid)',
        'papi2_assert_installation_archive_coherent(uuid)',
        'papi2_assert_part_archive_coherent(uuid)',
        'papi2_check_bom_cycle()',
        'papi2_check_item_cycle()',
        'papi2_validate_part()',
        'papi2_validate_inventory_item()',
        'papi2_validate_part_component()',
        'papi2_validate_item_component()'
    ] LOOP
        EXECUTE format('ALTER FUNCTION %s SET search_path = %I, pg_temp', function_signature, current_schema());
    END LOOP;
END;
$$;
