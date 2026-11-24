# katsukura

Part catalog and physical inventory management. A Part schema is identified by SKU;
each inventory row represents one physical item. Both catalog composition and item
ownership support nesting.

The backend uses Go, Fiber, GORM, and PostgreSQL. It serves the JSON API and,
when `STATIC_DIR` is set, the staff backoffice from the same process. The
backoffice in `webui/` is a Vite and React app using TypeScript, Mantine, and
Tabler icons. The browser calls `/api/v1` on the same origin. Customer-facing
browsing lives in another frontend.

Open **BOM** in the backoffice to browse and edit assemblies. Change **Unit type**
under **Filters** to browse other units, or choose **Start a BOM** to find units
that can get their first bill of materials.
Open **Dependency graph** to explore how units connect across the catalog,
including standalone and archived units.

## Run locally

Requirements: Go 1.26.2+, Node 22+, pnpm 11.25.0, and PostgreSQL 17+ or Docker.

```sh
cp .env.example .env
docker compose -f docker-compose.dev.yml up -d
make run          # API on http://localhost:8082
make webui-dev    # UI on http://localhost:3000, proxying /api to the API
```

The server applies versioned SQL migrations at startup. The development database
uses port 5438 to avoid the usual local PostgreSQL port. `make build` produces
`bin/katsukura`. `make webui-start` builds the UI and serves it from the API
(`STATIC_DIR=webui/dist`) on port 8082. The published image does the same.

## Data rules

- `parts`: one schema per unique SKU, with JSONB object metadata. When `sku` is
  omitted on create, the API generates `RF-` plus 8 random hex digits.
  `serial_aware` (default true) is set only on create: false means items of
  that SKU are stocked without serial numbers (nuts, bolts, and similar).
- `part_components`: parent SKU, child SKU, named slot, and exact quantity.
- `inventory_items`: one physical unit, nullable serial number, and JSONB object
  metadata. Non-null serial numbers are unique within a SKU and
  are set only on create; PATCH rejects `serial_number`. For a part with
  `serial_aware` false, create leaves `serial_number` null and rejects a
  supplied serial.
- `item_components`: installed child items and removal history. A child has only
  one active parent, and its SKU must match the selected BOM slot.

A composite item (one whose SKU has a BOM) always contains exactly its BOM. The API
builds it in one transaction, taking available items (not installed anywhere) for every
slot, and fails with `Not enough … in stock` when stock is short. After that, components
can only be swapped one for one (replace); deleting a composite returns its components
to stock, and a deleted composite cannot be restored. A SKU's BOM cannot change while it
has items in inventory. These rules are enforced by the API: the database still accepts
partial assemblies through direct SQL, so moving the rule into the database is an open
topic. The legacy `assembly_state` and `is_optional` columns are no longer used.

The installed count for each slot cannot exceed its BOM quantity. BOM and ownership
cycles are rejected.

PostgreSQL enforces these rules for API and direct SQL writes. Structural mutations
are serialized with a transaction advisory lock and must use READ COMMITTED isolation.
Cycle checks are immediate, since a cycle never needs a transient violation; the
remaining checks are deferred and validate the final transaction state, so one
transaction may lower a slot quantity and remove an installation in either order.
Installation snapshots are created by the database; installations are removed by
setting `removed_at`, preserving history. Referenced BOM rows cannot be deleted or
changed to a different child SKU.

Every check is scoped to the rows the statement touched, and an edit that cannot
break an invariant runs no check at all. Ownership-cycle detection costs assembly
nesting depth and does not grow with inventory size. BOM-cycle detection costs one
pass over the `part_components` rows reachable below the edited child, so it still
grows with catalog size, just no longer with the number of rows written. One
consequence of scoping: a write no longer detects a pre-existing violation
elsewhere in the database. `SELECT * FROM papi2_audit_structure()` reports any
whole-graph violation by constraint name and returns no rows when the database is
clean — use it after restoring a dump. Database dumps containing installation
history must be restored by an authorized database owner with triggers disabled
during restoration.

Archiving an installed item requires deleting its parent first. Archiving a part
archives all its items too (composites return their components to stock); it is
rejected while any of those items is installed elsewhere or the part is in another
active BOM.
Restore through the UI or PATCH with `{"archived_at": null}`. Archived records retain
history. Tree queries limit response depth without limiting stored nesting.

## Metadata schema

`metadata` on parts and inventory items is validated against one shared JSON Schema,
[`schema/metadata.schema.json`](schema/metadata.schema.json) (draft 2020-12), which is
embedded in the binary and checked on every create and PATCH. The shape is fixed:
every field is required, and unknown keys are rejected.

| Field | Type | Default |
|---|---|---|
| `category` | list of strings or null | null |
| `manufacturer` | string or null | null |
| `country_of_origin` | string or null | null |
| `notes` | string or null | null |
| `temperature_stage` | number or null | null |
| `image_urls` | list of strings or null; shown as a carousel in the UI | null |
| `specification` | object of string values; a free-form spec table such as `{"Width": "60 cm"}` | `{}` |

On create, fields left out get their schema `default`. A PATCH replaces the whole
object, so it must send every field; a missing one is reported as `required`. Null or
empty values are not shown. To add a field, add it to `properties` and `required` with a
`default`, plus a migration that backfills existing rows and the column default (see
[`sql/003_metadata_defaults.sql`](sql/003_metadata_defaults.sql)). The UI reads the keys
and defaults from `GET /metadata/schema`, so adding a field needs no frontend change.
The database only checks that metadata is an object, so direct SQL writes must follow
the schema themselves.

Mock data sets live in `sql_mock/` and are applied by hand to a migrated database. Each
file is one transaction and can be re-run safely.

```sh
# RF lab parts: 67 SKUs, 1210 items, no BOMs
psql "$DATA_SOURCE_NAME" -f sql_mock/900_rf_parts.sql
# RF composites built from those parts (needs 900 first)
psql "$DATA_SOURCE_NAME" -f sql_mock/901_rf_composites.sql
# RF metadata filled to the fixed schema shape (needs 901 first)
psql "$DATA_SOURCE_NAME" -f sql_mock/902_rf_metadata_defaults.sql

# IKEA-style assemblies (legacy data set)
psql "$DATA_SOURCE_NAME" -f sql_mock/ikea/900_schematics_inventory.sql
```

## API

All endpoints use `/api/v1`. JSON field names use snake_case. Lists return
`{data, total, limit, offset}`; errors return `{error: {code, message, details?}}`, where `details` lists
`{field, message}` per invalid field (for example each bad metadata key).

| Resource | Operations |
|---|---|
| `/parts` | List/search/paginate and create SKU schemas; `has_bom=true` lists only assemblies; each listed part has `stock` (`total`, `in_use`, `available` item counts) and prices; create accepts `serial_aware` (bool, default true) |
| `/parts/:id` | Read with BOM, `stock`, and prices; edit, archive, restore |
| `/parts/:id/components` | List and add BOM requirements |
| `/parts/filters` | List distinct catalog metadata filter values. Use `unit_type` to scope options to assemblies or units without a BOM. |
| `/bom/graph` | Read all unit nodes and BOM slots in one snapshot. Pass `include_archived=true` to include archived units and their retained relationships. |
| `/parts/:id/items` | POST `{count, serial_numbers?}` (1–1000) to build items in one transaction, each with a copy of the part's metadata and its BOM filled from stock; for serial-aware parts, `serial_numbers` has one entry per item and a blank or missing entry gets a generated `RF-SN-` serial number; for parts with `serial_aware` false, serials stay null and a non-blank `serial_numbers` entry is rejected |
| `/parts/:id/components/:componentID` | Edit or delete a requirement |
| `/inventory` | List/search/filter/paginate and create physical items; an installed item has `parent`, its active installation with `parent_item` |
| `/inventory/:id` | Read ownership/history, edit, archive, restore |
| `/inventory/:id/components/:installationID/replace` | POST `{component_item_id}` to swap an installed component for an available item of the same SKU |
| `/inventory/:id/tree` | Read a nested tree with bounded depth |
| `/summary` | Active SKU/item and ownership counts |
| `/metadata/schema` | GET the metadata JSON Schema |
| `/metadata/validate` | POST metadata; returns it with defaults filled in, as a create would store it, or 400 |
| `/uploads` | POST one multipart `file` (JPEG, PNG, or WebP, at most 1 MB); returns `{url}` when object storage is configured |

Parts carry three price fields as decimal strings (`"12.50"`), never floats:
`composite_price` (resolved from the bill of materials for assemblies; stored only
on leaf parts, default `"0.00"`), `unit_price` (optional override, or null), and
`effective_unit_price` (`unit_price` when set, otherwise the composite price).
Create and PATCH accept `composite_price` and `unit_price`; omit `composite_price`
on create to store `0.00`, and PATCH it to null to reset to `0.00`. Setting a
non-zero `composite_price` on a part that has a BOM returns 400. Adding a BOM row
resets the parent's stored composite price to `0`.

Lists accept `search`, `limit`, `offset`, and `include_archived`; inventory also accepts
`part_id` and `available=true` (not installed anywhere; this is public stock).
Parts accept `sort` values `newest` (default), `name`, `price` (effective unit
price), `items`, `in_use_items`, `available_items`, `utilisation`, `slots`, and
`editing`, with optional `order=asc` or `order=desc`.

Part and inventory catalogs can filter by `category`, `manufacturer`,
`country_of_origin`, `temperature_stage`, `stock` (`available`, `in_use`,
`empty`), `tracking` (`serial`, `quantity`), `unit_type` (`all`, `assembly`,
`part`), and `bom_editing` (`editable`, `locked`). Inventory applies these filters
to each item's unit. PATCH distinguishes omitted fields from explicit null. Null clears nullable
fields; metadata must be an object that matches the metadata schema. Liveness is
`/healthz`; database readiness is `/readyz`.

## Configuration

The server reads `.env` if present. Environment variables take precedence.

| Variable | Default |
|---|---|
| `PORT` | `8082` |
| `DATA_SOURCE_NAME` | Local development PostgreSQL URL from `.env.example` |
| `DATABASE_URL` | Alias used when `DATA_SOURCE_NAME` is unset |
| `AUTO_MIGRATE` | `true`; applies explicit SQL migrations |
| `SHUTDOWN_TIMEOUT` | `10s` |
| `STATIC_DIR` | empty; directory of the built UI (`index.html` and assets). Empty serves the API only |
| `S3_ENDPOINT` | empty |
| `S3_PUBLIC_URL` | empty; falls back to `S3_ENDPOINT` |
| `S3_ACCESS_KEY` | empty |
| `S3_SECRET_KEY` | empty |
| `S3_BUCKET_NAME` | empty; image upload stays disabled until this is set, along with the endpoint and keys |
| `S3_REGION` | `auto` when a bucket is set |

## Verify

```sh
make test
make lint
make webui-check
make webui-test
```

For PostgreSQL integration tests, use a test database whose user may create schemas:

```sh
TEST_DATABASE_URL=postgres://katsukura:katsukura@localhost:5438/katsukura?sslmode=disable make test-integration
```

Integration suites use isolated schemas and exercise database invariants and HTTP
workflows. CI runs them against PostgreSQL. `make docker-build` builds one image,
`katsukura:local`, which serves the API and the backoffice on port 8082.
