-- Rewrites mock metadata to match schema/metadata.schema.json.
-- image_url (string) becomes image_urls (list), a string category becomes a
-- one-element list, and every key not in the schema is dropped.
-- Safe to run more than once; rows already in the new shape are left untouched.
BEGIN;
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;

CREATE FUNCTION pg_temp.string_list(v jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE jsonb_typeof(v)
        WHEN 'string' THEN CASE WHEN v #>> '{}' <> '' THEN jsonb_build_array(v) ELSE '[]'::jsonb END
        WHEN 'array' THEN COALESCE((
            SELECT jsonb_agg(e ORDER BY n) FROM jsonb_array_elements(v) WITH ORDINALITY AS t(e, n)
            WHERE jsonb_typeof(e) = 'string' AND e #>> '{}' <> ''
        ), '[]'::jsonb)
        ELSE '[]'::jsonb
    END
$$;

CREATE FUNCTION pg_temp.typed(v jsonb, t text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN jsonb_typeof(v) = t THEN v END
$$;

CREATE FUNCTION pg_temp.to_schema(m jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
    SELECT jsonb_build_object(
        'category', pg_temp.string_list(m -> 'category'),
        'image_urls', (
            SELECT COALESCE(jsonb_agg(u ORDER BY n), '[]'::jsonb) FROM (
                SELECT DISTINCT ON (u) u, n FROM jsonb_array_elements(
                    pg_temp.string_list(m -> 'image_urls') || pg_temp.string_list(m -> 'image_url')
                ) WITH ORDINALITY AS t(u, n) ORDER BY u, n
            ) AS first_seen
        )
    ) || jsonb_strip_nulls(jsonb_build_object(
        'manufacturer', pg_temp.typed(m -> 'manufacturer', 'string'),
        'country_of_origin', pg_temp.typed(m -> 'country_of_origin', 'string'),
        'notes', pg_temp.typed(m -> 'notes', 'string'),
        'temperature_stage', pg_temp.typed(m -> 'temperature_stage', 'number')
    ))
$$;

UPDATE parts SET metadata = pg_temp.to_schema(metadata)
WHERE metadata IS DISTINCT FROM pg_temp.to_schema(metadata);

UPDATE inventory_items SET metadata = pg_temp.to_schema(metadata)
WHERE metadata IS DISTINCT FROM pg_temp.to_schema(metadata);

COMMIT;

-- Verification: zero rows means no metadata key falls outside the schema.
SELECT 'parts' AS tbl, id, k FROM parts, jsonb_object_keys(metadata) AS k
WHERE k NOT IN ('category', 'manufacturer', 'country_of_origin', 'notes', 'temperature_stage', 'image_urls')
UNION ALL
SELECT 'inventory_items', id, k FROM inventory_items, jsonb_object_keys(metadata) AS k
WHERE k NOT IN ('category', 'manufacturer', 'country_of_origin', 'notes', 'temperature_stage', 'image_urls');
