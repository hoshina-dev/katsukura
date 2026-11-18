-- Resolved composite prices can exceed numeric(14,2) when quantities multiply
-- valid leaf prices. Compute in unconstrained numeric, and memoize each distinct
-- part once per call so deep shared BOMs are not recomputed exponentially.
-- Uses an in-function jsonb map (no temp tables) so catalog reads stay read-only.

CREATE OR REPLACE FUNCTION part_composite_price(p_part uuid) RETURNS numeric
LANGUAGE plpgsql STABLE AS $$
DECLARE
    prices jsonb := '{}'::jsonb;
    part_ids uuid[];
    cur uuid;
    total numeric;
    has_children boolean;
    progress boolean;
    i int;
BEGIN
    WITH RECURSIVE walk AS (
        SELECT p_part AS part_id
        UNION
        SELECT c.child_part_id
          FROM walk w
          JOIN part_components c ON c.parent_part_id = w.part_id
    )
    SELECT coalesce(array_agg(DISTINCT walk.part_id), ARRAY[p_part]) INTO part_ids FROM walk;

    FOR i IN 1 .. coalesce(array_length(part_ids, 1), 0) LOOP
        cur := part_ids[i];
        SELECT EXISTS (
            SELECT 1 FROM part_components pc WHERE pc.parent_part_id = cur
        ) INTO has_children;
        IF NOT has_children THEN
            prices := prices || jsonb_build_object(
                cur::text,
                COALESCE((SELECT p.composite_price FROM parts p WHERE p.id = cur), 0)
            );
        END IF;
    END LOOP;

    LOOP
        EXIT WHEN prices ? p_part::text;
        progress := false;
        FOR i IN 1 .. coalesce(array_length(part_ids, 1), 0) LOOP
            cur := part_ids[i];
            IF prices ? cur::text THEN
                CONTINUE;
            END IF;
            IF EXISTS (
                SELECT 1 FROM part_components pc
                 WHERE pc.parent_part_id = cur
                   AND NOT (prices ? pc.child_part_id::text)
            ) THEN
                CONTINUE;
            END IF;
            SELECT COALESCE(sum(pc.required_quantity * (prices ->> pc.child_part_id::text)::numeric), 0)
              INTO total
              FROM part_components pc
             WHERE pc.parent_part_id = cur;
            prices := prices || jsonb_build_object(cur::text, total);
            progress := true;
        END LOOP;
        IF NOT progress THEN
            RAISE EXCEPTION 'unable to resolve composite price for %', p_part
                USING ERRCODE = 'P0001';
        END IF;
    END LOOP;

    RETURN (prices ->> p_part::text)::numeric;
END;
$$;

ALTER FUNCTION part_composite_price(uuid) PARALLEL SAFE;

DO $$
BEGIN
    EXECUTE format(
        'ALTER FUNCTION part_composite_price(uuid) SET search_path = %I, pg_temp',
        current_schema()
    );
END;
$$;
