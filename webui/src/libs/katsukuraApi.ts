// Katsukura REST client. The browser calls the API on the same origin.

import {
  type BomGraph,
  CATALOG_PAGE_SIZE,
  type CatalogEntry,
  type CatalogFacets,
  type CatalogFilters,
  type CatalogQuery,
  imageUrls,
  type Item,
  type Installation,
  type ItemDetail,
  type List,
  type Metadata,
  type Part,
  type PartComponent,
  type PartDetail,
} from "./inventory";

const API_URL = "/api/v1";

export type ErrorDetail = { field: string; message: string };

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    // Per-field problems, e.g. one entry per invalid metadata key
    readonly details: ErrorDetail[] = [],
  ) {
    super(message);
  }
}

export function isMissing(error: unknown) {
  return (
    error instanceof ApiError && (error.status === 400 || error.status === 404)
  );
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(API_URL + path, init);
  } catch (error) {
    console.error("API request failed", error);
    throw new ApiError("Could not reach the inventory API. Try again.", 0);
  }
  const body = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new ApiError(
      body?.error?.message || `API request failed (${response.status})`,
      response.status,
      body?.error?.details ?? [],
    );
  }
  return body as T;
}

function get<T>(path: string) {
  return request<T>(path, { cache: "no-store" });
}

function send<T>(method: string, path: string, body?: unknown) {
  return request<T>(path, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
}

function qs(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  return search.toString();
}

// The API generates the SKU when it is omitted
export type NewPart = Pick<Part, "name" | "description" | "metadata"> & {
  sku?: string;
  serial_aware?: boolean;
  composite_price?: string;
  unit_price?: string | null;
};

export function createPart(part: NewPart) {
  return send<Part>("POST", "/parts", part);
}

export function updatePart(
  id: string,
  patch: Partial<Pick<Part, "name" | "description" | "metadata">> & {
    // null clears / resets: composite_price -> 0.00, unit_price -> no override
    composite_price?: string | null;
    unit_price?: string | null;
  },
) {
  return send<Part>("PATCH", `/parts/${id}`, patch);
}

// Archives the part and all its items; the API keeps them for history
export function archivePart(id: string) {
  return send<unknown>("DELETE", `/parts/${id}`);
}

export function deleteComponent(partId: string, componentId: string) {
  return send<unknown>("DELETE", `/parts/${partId}/components/${componentId}`);
}

// One item per serial number when the part is serial-aware; the API copies metadata
export function createItems(
  partId: string,
  count: number,
  serialNumbers?: string[],
) {
  return send<{ data: Item[] }>("POST", `/parts/${partId}/items`, {
    count,
    ...(serialNumbers !== undefined && serialNumbers.length > 0
      ? { serial_numbers: serialNumbers }
      : {}),
  });
}

// Archives the item; the API keeps it for history
export function archiveItem(id: string) {
  return send<unknown>("DELETE", `/inventory/${id}`);
}

export function getPart(id: string) {
  return get<PartDetail>(`/parts/${encodeURIComponent(id)}`);
}

export async function findPartBySku(sku: string) {
  const list = await get<List<Part>>(
    `/parts?${qs({ search: sku, limit: 50 })}`,
  );
  const match = list.data.find((part) => part.sku === sku);
  return match ? getPart(match.id) : null;
}

type ItemFilter = {
  limit?: number;
  offset?: number;
  search?: string;
  // Only items not installed anywhere
  available?: boolean;
  includeArchived?: boolean;
};

const flag = (on?: boolean) => (on ? "true" : undefined);

export function getBomGraph(includeArchived: boolean) {
  const path = includeArchived ? "/bom/graph?include_archived=true" : "/bom/graph";
  return request<BomGraph>(path, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
}

export function listItems(partId: string, filter: ItemFilter = {}) {
  const { limit = 100, offset, search, available, includeArchived } = filter;
  return get<List<Item>>(
    `/inventory?${qs({
      part_id: partId,
      limit,
      offset,
      search,
      available: flag(available),
      include_archived: flag(includeArchived),
    })}`,
  );
}

// Items of any unit whose serial number contains the text; the API also
// matches unit names and SKUs, so those rows are dropped here
export async function findItemsBySerial(serial: string, limit = 10, filters?: CatalogFilters) {
  const list = await get<List<Item>>(
    `/inventory?${qs({ search: serial, limit, ...filters })}`,
  );
  const needle = serial.toLowerCase();
  return list.data.filter((item) =>
    item.serial_number?.toLowerCase().includes(needle),
  );
}

export function getItem(id: string) {
  return get<ItemDetail>(`/inventory/${id}`);
}

export function updateItem(id: string, patch: Partial<Pick<Item, "metadata">>) {
  return send<Item>("PATCH", `/inventory/${id}`, patch);
}

// Swaps an installed component for an available item of the same SKU
export function replaceComponent(
  parentId: string,
  installationId: string,
  childId: string,
) {
  return send<Installation>(
    "POST",
    `/inventory/${parentId}/components/${installationId}/replace`,
    { component_item_id: childId },
  );
}

export type NewComponent = Pick<
  PartComponent,
  "child_part_id" | "slot" | "required_quantity"
>;

export function createComponent(partId: string, component: NewComponent) {
  return send<PartComponent>("POST", `/parts/${partId}/components`, component);
}

export function updateComponent(
  partId: string,
  componentId: string,
  patch: Partial<Pick<PartComponent, "required_quantity">>,
) {
  return send<PartComponent>(
    "PATCH",
    `/parts/${partId}/components/${componentId}`,
    patch,
  );
}

export function searchParts(search: string, limit = 20) {
  return get<List<Part>>(`/parts?${qs({ search, limit })}`);
}

// Catalog

export function getCatalogFacets(unitType: string) {
  return get<CatalogFacets>(`/parts/filters?${qs({ unit_type: unitType })}`);
}

function toEntry(part: Part): CatalogEntry {
  return {
    id: part.id,
    sku: part.sku,
    name: part.name,
    description: part.description,
    imageUrl: imageUrls(part.metadata)[0] ?? null,
    stock: part.stock ?? { total: 0, in_use: 0, available: 0 },
    componentCount: part.component_count ?? 0,
    effectiveUnitPrice:
      part.effective_unit_price ?? part.unit_price ?? part.composite_price ?? "0.00",
    hasUnitPriceOverride: part.unit_price != null,
  };
}

// offset overrides the page, e.g. to continue after rows already shown
export async function getCatalog(
  query: CatalogQuery,
  pageSize = CATALOG_PAGE_SIZE,
  offset = (query.page - 1) * pageSize,
) {
  const sort = {
    default: undefined,
    name: "name",
    price: "price",
    amount: "items",
    in_use: "in_use_items",
    available: "available_items",
    utilisation: "utilisation",
    slots: "slots",
    editing: "editing",
  }[query.sort];
  const list = await get<List<Part>>(
    `/parts?${qs({
      search: query.search,
      sort,
      order: query.order,
      ...query.filters,
      limit: pageSize,
      offset,
    })}`,
  );
  return { entries: list.data.map(toEntry), total: list.total };
}
