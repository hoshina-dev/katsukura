# papi2

Part catalog and physical inventory management. A Part schema is identified by SKU;
each inventory row represents one physical item. Both catalog composition and item
ownership support nesting.

The backend uses Go, Fiber, GORM, and PostgreSQL and serves only the JSON API.
The backoffice in `webui/` is a separate Next.js (App Router) app using React,
TypeScript, Mantine, and Tabler icons. It is for staff managing parts, stock and
BOMs; customer-facing browsing lives in another frontend. Its server components call the API
through `PAPI_URL`, so the browser never talks to the Go server directly.

## Run locally

Requirements: Go 1.26.2+, Node 22+, pnpm 11.25.0, and PostgreSQL 17+ or Docker.

```sh
cp .env.example .env
cp webui/.env.example webui/.env.local
docker compose -f docker-compose.dev.yml up -d
make run          # API on http://localhost:8082
make webui-dev    # UI on http://localhost:3000 (second terminal)
```

The server applies versioned SQL migrations at startup. The development database
uses port 5438 to avoid the usual local PostgreSQL port. `make build` produces
`bin/papi2`; `make webui-start` builds and serves the production UI.

The UI reads `PAPI_URL` (default `http://localhost:8082`) on the server side.

## Data rules

- `parts`: one schema per unique SKU, with JSONB object metadata. When `sku` is
  omitted on create, the API generates `RF-` plus 8 random hex digits.
- `part_components`: parent SKU, child SKU, named slot, and exact quantity.
- `inventory_items`: one physical unit, nullable serial number, string location,
  and JSONB object metadata. Non-null serial numbers are unique within a SKU.
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
| `/parts` | List/search/paginate and create SKU schemas; each listed part has `stock` (`total`, `in_use`, `available` item counts) |
| `/parts/:id` | Read with BOM and `stock`, edit, archive, restore |
| `/parts/:id/components` | List and add BOM requirements |
| `/parts/:id/items` | POST `{count}` (1–1000) to build items in one transaction, each with a generated `RF-SN-` serial number, a copy of the part's metadata, and its BOM filled from stock |
| `/parts/:id/components/:componentID` | Edit or delete a requirement |
| `/inventory` | List/search/filter/paginate and create physical items; an installed item has `parent`, its active installation with `parent_item` |
| `/inventory/:id` | Read ownership/history, edit, archive, restore |
| `/inventory/:id/components/:installationID/replace` | POST `{component_item_id}` to swap an installed component for an available item of the same SKU |
| `/inventory/:id/tree` | Read a nested tree with bounded depth |
| `/summary` | Active SKU/item and ownership counts |
| `/metadata/schema` | GET the metadata JSON Schema |
| `/metadata/validate` | POST metadata; returns it with defaults filled in, as a create would store it, or 400 |

Lists accept `search`, `limit`, `offset`, and `include_archived`; inventory also accepts
`part_id` and `available=true` (not installed anywhere; this is public stock). Parts
also accept `sort`: `newest` (default), `name`, `items` (most items first) or
`available_items` (most items not installed anywhere first). PATCH distinguishes omitted fields from explicit null. Null clears nullable
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

## Verify

```sh
make test
make lint
make webui-check
make webui-test
```

For PostgreSQL integration tests, use a test database whose user may create schemas:

```sh
TEST_DATABASE_URL=postgres://papi2:papi2@localhost:5438/papi2?sslmode=disable make test-integration
```

Integration suites use isolated schemas and exercise database invariants and HTTP
workflows. CI runs them against PostgreSQL. `make docker-build` builds the API image
(`papi2:local`) and the standalone Next.js UI image (`papi2-webui:local`); run the
UI container with `PAPI_URL` pointing at the API.
