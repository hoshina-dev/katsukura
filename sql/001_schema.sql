CREATE TABLE parts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sku text NOT NULL UNIQUE CHECK (btrim(sku) <> ''),
    name text NOT NULL CHECK (btrim(name) <> ''),
    description text,
    metadata jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(metadata) = 'object'),
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE part_components (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_part_id uuid NOT NULL REFERENCES parts(id),
    child_part_id uuid NOT NULL REFERENCES parts(id),
    slot text NOT NULL CHECK (btrim(slot) <> ''),
    required_quantity integer NOT NULL CHECK (required_quantity > 0),
    is_optional boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (parent_part_id, slot),
    UNIQUE (id, parent_part_id, child_part_id)
);
CREATE INDEX part_components_child ON part_components(child_part_id);

CREATE TABLE inventory_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    part_id uuid NOT NULL REFERENCES parts(id),
    serial_number text CHECK (serial_number IS NULL OR btrim(serial_number) <> ''),
    assembly_state text NOT NULL DEFAULT 'draft' CHECK (assembly_state IN ('draft', 'complete')),
    location text,
    metadata jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(metadata) = 'object'),
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (part_id, serial_number),
    UNIQUE (id, part_id)
);

CREATE TABLE item_components (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_item_id uuid NOT NULL REFERENCES inventory_items(id),
    component_item_id uuid NOT NULL REFERENCES inventory_items(id),
    part_component_id uuid NOT NULL REFERENCES part_components(id),
    parent_part_id uuid NOT NULL,
    child_part_id uuid NOT NULL,
    position text,
    installed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    removed_at timestamptz,
    bom_snapshot jsonb NOT NULL CHECK (jsonb_typeof(bom_snapshot) = 'object'),
    CHECK (removed_at IS NULL OR removed_at >= installed_at),
    FOREIGN KEY (parent_item_id, parent_part_id) REFERENCES inventory_items(id, part_id) ON DELETE RESTRICT,
    FOREIGN KEY (component_item_id, child_part_id) REFERENCES inventory_items(id, part_id) ON DELETE RESTRICT,
    FOREIGN KEY (part_component_id, parent_part_id, child_part_id) REFERENCES part_components(id, parent_part_id, child_part_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX item_components_one_active_parent ON item_components(component_item_id) WHERE removed_at IS NULL;
CREATE INDEX item_components_parent ON item_components(parent_item_id);
CREATE INDEX item_components_bom ON item_components(part_component_id);
CREATE INDEX item_components_active_slot ON item_components(parent_item_id, part_component_id) WHERE removed_at IS NULL;

-- Statement locks precede row locks; volatile deferred checks read after lock waits.
CREATE FUNCTION papi2_lock_structure() RETURNS trigger LANGUAGE plpgsql VOLATILE AS $$
BEGIN
    IF current_setting('transaction_isolation') <> 'read committed' THEN
        RAISE EXCEPTION 'structural writes require READ COMMITTED' USING ERRCODE = '23514', CONSTRAINT = 'papi2_read_committed';
    END IF;
    PERFORM set_config('lock_timeout', '5s', true);
    PERFORM pg_advisory_xact_lock(72627432);
    RETURN NULL;
END;
$$;

CREATE FUNCTION papi2_protect_rows() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.id <> OLD.id THEN
            RAISE EXCEPTION 'identity is immutable' USING ERRCODE = '23514', CONSTRAINT = 'papi2_immutable_identity';
        END IF;
        IF TG_TABLE_NAME = 'parts' THEN
            IF NEW.sku <> OLD.sku AND (
                EXISTS (SELECT 1 FROM inventory_items WHERE part_id = OLD.id) OR
                EXISTS (SELECT 1 FROM part_components WHERE parent_part_id = OLD.id OR child_part_id = OLD.id)
            ) THEN
                RAISE EXCEPTION 'SKU is in use' USING ERRCODE = '23514', CONSTRAINT = 'papi2_sku_in_use';
            END IF;
        ELSIF TG_TABLE_NAME = 'inventory_items' THEN
            IF NEW.part_id <> OLD.part_id THEN
                RAISE EXCEPTION 'item SKU is immutable' USING ERRCODE = '23514', CONSTRAINT = 'papi2_immutable_part';
            END IF;
        ELSIF TG_TABLE_NAME = 'part_components' THEN
            IF NEW.parent_part_id <> OLD.parent_part_id THEN
                RAISE EXCEPTION 'BOM parent is immutable' USING ERRCODE = '23514', CONSTRAINT = 'papi2_immutable_parent';
            END IF;
            IF NEW.child_part_id <> OLD.child_part_id AND EXISTS (SELECT 1 FROM parts WHERE id = NEW.child_part_id AND archived_at IS NOT NULL) THEN
                RAISE EXCEPTION 'BOM child must be active' USING ERRCODE = '23514', CONSTRAINT = 'papi2_active_archived';
            END IF;
        ELSIF TG_TABLE_NAME = 'item_components' THEN
            IF ROW(NEW.parent_item_id, NEW.component_item_id, NEW.part_component_id, NEW.parent_part_id, NEW.child_part_id, NEW.position, NEW.installed_at, NEW.bom_snapshot)
               IS DISTINCT FROM ROW(OLD.parent_item_id, OLD.component_item_id, OLD.part_component_id, OLD.parent_part_id, OLD.child_part_id, OLD.position, OLD.installed_at, OLD.bom_snapshot)
               OR (OLD.removed_at IS NOT NULL AND NEW.removed_at IS DISTINCT FROM OLD.removed_at) THEN
                RAISE EXCEPTION 'installation history is immutable' USING ERRCODE = '23514', CONSTRAINT = 'papi2_immutable_history';
            END IF;
            IF OLD.removed_at IS NULL AND NEW.removed_at IS NOT NULL THEN
                NEW.removed_at := clock_timestamp();
            END IF;
        END IF;
    ELSIF TG_TABLE_NAME = 'item_components' THEN
        IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'installation history must be retained' USING ERRCODE = '23514', CONSTRAINT = 'papi2_immutable_history';
        END IF;
        IF NEW.removed_at IS NOT NULL THEN
            RAISE EXCEPTION 'new installations must be active' USING ERRCODE = '23514', CONSTRAINT = 'papi2_immutable_history';
        END IF;
        NEW.installed_at := clock_timestamp();
        SELECT parent_part_id, child_part_id, jsonb_build_object('id', id, 'parent_part_id', parent_part_id,
            'child_part_id', child_part_id, 'slot', slot,
            'required_quantity', required_quantity, 'is_optional', is_optional,
            'parent_sku', (SELECT sku FROM parts WHERE id = parent_part_id),
            'child_sku', (SELECT sku FROM parts WHERE id = child_part_id))
        INTO NEW.parent_part_id, NEW.child_part_id, NEW.bom_snapshot FROM part_components WHERE id = NEW.part_component_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'BOM slot does not exist' USING ERRCODE = '23503', CONSTRAINT = 'item_components_part_component_id_fkey';
        END IF;
    ELSIF TG_OP = 'INSERT' AND TG_TABLE_NAME = 'part_components' THEN
        IF EXISTS (SELECT 1 FROM parts WHERE id IN (NEW.parent_part_id, NEW.child_part_id) AND archived_at IS NOT NULL) THEN
            RAISE EXCEPTION 'new BOM must reference active SKUs' USING ERRCODE = '23514', CONSTRAINT = 'papi2_active_archived';
        END IF;
    END IF;
    IF TG_OP = 'UPDATE' AND TG_TABLE_NAME <> 'item_components' THEN NEW.updated_at := now(); END IF;
    RETURN NEW;
END;
$$;

CREATE FUNCTION papi2_validate_structure() RETURNS trigger LANGUAGE plpgsql VOLATILE AS $$
BEGIN
    IF EXISTS (
        WITH RECURSIVE reach(start_id, node_id) AS (
            SELECT parent_part_id, child_part_id FROM part_components
            UNION
            SELECT r.start_id, c.child_part_id FROM reach r JOIN part_components c ON c.parent_part_id = r.node_id
        ) SELECT 1 FROM reach WHERE start_id = node_id
    ) THEN
        RAISE EXCEPTION 'BOM cycle' USING ERRCODE = '23514', CONSTRAINT = 'papi2_bom_cycle';
    END IF;
    IF EXISTS (
        WITH RECURSIVE reach(start_id, node_id) AS (
            SELECT parent_item_id, component_item_id FROM item_components WHERE removed_at IS NULL
            UNION
            SELECT r.start_id, c.component_item_id FROM reach r JOIN item_components c ON c.parent_item_id = r.node_id WHERE c.removed_at IS NULL
        ) SELECT 1 FROM reach WHERE start_id = node_id
    ) THEN
        RAISE EXCEPTION 'ownership cycle' USING ERRCODE = '23514', CONSTRAINT = 'papi2_item_cycle';
    END IF;
    IF EXISTS (
        SELECT 1 FROM item_components c
        JOIN inventory_items p ON p.id = c.parent_item_id
        JOIN inventory_items child ON child.id = c.component_item_id
        JOIN part_components b ON b.id = c.part_component_id
        WHERE c.removed_at IS NULL AND (p.part_id <> b.parent_part_id OR child.part_id <> b.child_part_id)
    ) THEN
        RAISE EXCEPTION 'installation must match exact BOM SKU' USING ERRCODE = '23514', CONSTRAINT = 'papi2_slot_match';
    END IF;
    IF EXISTS (
        SELECT 1 FROM item_components c JOIN part_components b ON b.id = c.part_component_id
        WHERE c.removed_at IS NULL GROUP BY c.parent_item_id, b.id, b.required_quantity
        HAVING count(*) > b.required_quantity
    ) THEN
        RAISE EXCEPTION 'slot quantity exceeded' USING ERRCODE = '23514', CONSTRAINT = 'papi2_quantity_cap';
    END IF;
    IF EXISTS (
        SELECT 1 FROM item_components c JOIN inventory_items p ON p.id = c.parent_item_id
        JOIN inventory_items child ON child.id = c.component_item_id
        WHERE c.removed_at IS NULL AND (p.archived_at IS NOT NULL OR child.archived_at IS NOT NULL)
    ) OR EXISTS (
        SELECT 1 FROM inventory_items i JOIN parts p ON p.id = i.part_id
        WHERE i.archived_at IS NULL AND p.archived_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'archived entities are in active use' USING ERRCODE = '23514', CONSTRAINT = 'papi2_active_archived';
    END IF;
    IF EXISTS (
        SELECT 1 FROM part_components c JOIN parts p ON p.id = c.parent_part_id
        JOIN parts child ON child.id = c.child_part_id
        WHERE p.archived_at IS NULL AND child.archived_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'archived SKU belongs to an active BOM' USING ERRCODE = '23514', CONSTRAINT = 'papi2_part_archive_in_use';
    END IF;
    RETURN NULL;
END;
$$;

CREATE FUNCTION papi2_reject_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'TRUNCATE would discard inventory history' USING ERRCODE = '23514', CONSTRAINT = 'papi2_immutable_history';
END;
$$;

DO $$
DECLARE table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY['parts', 'part_components', 'inventory_items', 'item_components'] LOOP
        EXECUTE format('CREATE TRIGGER lock_structure BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH STATEMENT EXECUTE FUNCTION papi2_lock_structure()', table_name);
        EXECUTE format('CREATE TRIGGER protect_rows BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION papi2_protect_rows()', table_name);
        EXECUTE format('CREATE CONSTRAINT TRIGGER validate_structure AFTER INSERT OR UPDATE OR DELETE ON %I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION papi2_validate_structure()', table_name);
        EXECUTE format('CREATE TRIGGER reject_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION papi2_reject_truncate()', table_name);
    END LOOP;
END;
$$;
CREATE TRIGGER retain_history BEFORE DELETE ON item_components FOR EACH ROW EXECUTE FUNCTION papi2_protect_rows();

-- Explicit pg_temp last prevents caller-created tables shadowing invariant checks.
DO $$
DECLARE function_name text;
BEGIN
    FOREACH function_name IN ARRAY ARRAY['papi2_lock_structure', 'papi2_protect_rows', 'papi2_validate_structure', 'papi2_reject_truncate'] LOOP
        EXECUTE format('ALTER FUNCTION %I() SET search_path = %I, pg_temp', function_name, current_schema());
    END LOOP;
END;
$$;
