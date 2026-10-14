# papi2

Part catalog and physical inventory management. A Part schema is identified by SKU;
each inventory row represents one physical item. Both catalog composition and item
ownership support nesting.

The backend uses Go, Fiber, GORM, and PostgreSQL. The management UI uses React,
TypeScript, Vite, Mantine, and Lucide. Its pnpm production build is embedded into
the Go binary and served on the same origin as the API.

## Run locally

Requirements: Go 1.26.2+, Node 22+, pnpm 11.25.0, and PostgreSQL 17+ or Docker.

```sh
cp .env.example .env
docker compose -f docker-compose.dev.yml up -d
make build
./bin/papi2
```

Open <http://localhost:8082>. The server applies versioned SQL migrations at startup.
The development database uses port 5438 to avoid the usual local PostgreSQL port.

For hot reload, run these commands in separate terminals:

```sh
make run
make webui-dev
```

Vite serves the UI at <http://localhost:5173> and proxies the API to port 8082.
Run `make webui-build` followed by restarting the backend to update its embedded UI.

## Data rules

- `parts`: one schema per unique SKU, with JSONB object metadata.
- `part_components`: parent SKU, child SKU, named slot, and quantity upper limit.
- `inventory_items`: one physical unit, nullable serial number, string location,
  and JSONB object metadata. Non-null serial numbers are unique within a SKU.
- `item_components`: installed child items and removal history. A child has only
  one active parent, and its SKU must match the selected BOM slot.

Missing components are allowed, including for items marked `complete`. The installed
count for each slot cannot exceed its BOM quantity. Assembly state is informational;
`is_optional` does not add a minimum quantity requirement. BOM and ownership cycles
are rejected.

PostgreSQL enforces these rules for API and direct SQL writes. Structural mutations
are serialized with a transaction advisory lock and must use READ COMMITTED isolation.
Deferred validation checks the final transaction state. Installation snapshots are
created by the database; installations are removed by setting `removed_at`, preserving
history. Referenced BOM rows cannot be deleted or changed to a different child SKU.

Deferred checks currently validate the full graph, so large batch imports may need
a future optimization. Database dumps containing installation history must be
restored by an authorized database owner with triggers disabled during restoration.

Archiving an item requires removing its active parent and children first. Archiving a
Part requires archiving its items and removing references from active parent BOMs.
Restore through the UI or PATCH with `{"archived_at": null}`. Archived records retain
history. Tree queries limit response depth without limiting stored nesting.

## API

All endpoints use `/api/v1`. JSON field names use snake_case. Lists return
`{data, total, limit, offset}`; errors return `{error: {code, message}}`.

| Resource | Operations |
|---|---|
| `/parts` | List/search/paginate and create SKU schemas |
| `/parts/:id` | Read with BOM, edit, archive, restore |
| `/parts/:id/components` | List and add BOM requirements |
| `/parts/:id/components/:componentID` | Edit or delete a requirement |
| `/inventory` | List/search/filter/paginate and create physical items |
| `/inventory/:id` | Read ownership/history, edit, archive, restore |
| `/inventory/:id/components` | Install a child item in a BOM slot |
| `/inventory/:id/components/:installationID` | Remove an installed child |
| `/inventory/:id/tree` | Read a nested tree with bounded depth |
| `/summary` | Active SKU/item and ownership counts |

Lists accept `search`, `limit`, `offset`, and `include_archived`; inventory also accepts
`part_id`. PATCH distinguishes omitted fields from explicit null. Null clears nullable
fields; metadata must be an object. Liveness is `/healthz`; database readiness is `/readyz`.

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
cd webui && pnpm test
```

For PostgreSQL integration tests, use a test database whose user may create schemas:

```sh
TEST_DATABASE_URL=postgres://papi2:papi2@localhost:5438/papi2?sslmode=disable make test-integration
```

Integration suites use isolated schemas and exercise database invariants and HTTP
workflows. CI runs them against PostgreSQL. `make docker-build` builds the production
image with the UI included.
