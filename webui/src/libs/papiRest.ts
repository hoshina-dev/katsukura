// PAPI REST client, only used in server components and server actions

import "server-only";

import {
  type BomNode,
  CATALOG_PAGE_SIZE,
  type CatalogEntry,
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
  type TreeNode,
} from "./inventory";

const API_URL = new URL(
  "/api/v1",
  process.env.PAPI_URL || "http://localhost:8082",
).href;

// Short cache for lookups that are repeated across catalog pages
const LOOKUP_TTL_SECONDS = 30;

export type ErrorDetail = { field: string; message: string };

export class PapiError extends Error {
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
    error instanceof PapiError && (error.status === 400 || error.status === 404)
  );
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(API_URL + path, init);
  const body = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new PapiError(
      body?.error?.message || `PAPI request failed (${response.status})`,
      response.status,
      body?.error?.details,
    );
  }
  return body as T;
}

// Cached lookups are tagged so server actions can expire them after writes
function get<T>(path: string, ttl?: number, tags?: string[]) {
  return request<T>(
    path,
    ttl ? { next: { revalidate: ttl, tags } } : { cache: "no-store" },
  );
}

function send<T>(method: string, path: string, body?: unknown) {
  return request<T>(path, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
}

export const partTag = (partId: string) => `part:${partId}`;
// Item changes can demote assemblies of other SKUs, so stock counts share one tag
export const ITEMS_TAG = "items";

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
};

export function createPart(part: NewPart) {
  return send<Part>("POST", "/parts", part);
}

export function updatePart(
  id: string,
  patch: Partial<Pick<Part, "description" | "metadata">>,
) {
  return send<Part>("PATCH", `/parts/${id}`, patch);
}

export function deleteComponent(partId: string, componentId: string) {
  return send<unknown>("DELETE", `/parts/${partId}/components/${componentId}`);
}

// The API generates serial numbers and copies the part's metadata
export function createItems(partId: string, count: number) {
  return send<{ data: Item[] }>("POST", `/parts/${partId}/items`, { count });
}

// Archives the item; the API keeps it for history
export function archiveItem(id: string) {
  return send<unknown>("DELETE", `/inventory/${id}`);
}

export function getMetadataSchema() {
  return get<{ properties?: Record<string, unknown> }>(
    "/metadata/schema",
    LOOKUP_TTL_SECONDS,
  );
}

export function validateMetadata(metadata: Record<string, unknown>) {
  return send<Metadata>("POST", "/metadata/validate", metadata);
}

export function getPart(id: string) {
  return get<PartDetail>(`/parts/${id}`, LOOKUP_TTL_SECONDS, [partTag(id)]);
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
  // Only items not installed anywhere: the public stock
  available?: boolean;
};

const flag = (on?: boolean) => (on ? "true" : undefined);

export function listItems(partId: string, filter: ItemFilter = {}) {
  const { limit = 100, offset, search, available } = filter;
  return get<List<Item>>(
    `/inventory?${qs({
      part_id: partId,
      limit,
      offset,
      search,
      available: flag(available),
    })}`,
  );
}

export function getItem(id: string) {
  return get<ItemDetail>(`/inventory/${id}`);
}

export function updateItem(
  id: string,
  patch: Partial<Pick<Item, "location" | "metadata">>,
) {
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

export function getItemTree(id: string) {
  return get<TreeNode>(`/inventory/${id}/tree?depth=20`);
}

// Catalog

// Stock: items of the SKU; the public UI counts only those not installed
async function stockCount(partId: string, availableOnly: boolean) {
  const list = await get<List<Item>>(
    `/inventory?${qs({ part_id: partId, limit: 1, available: flag(availableOnly) })}`,
    LOOKUP_TTL_SECONDS,
    [ITEMS_TAG],
  );
  return list.total;
}

async function toEntry(
  part: Part,
  availableOnly: boolean,
): Promise<CatalogEntry> {
  const [detail, stock] = await Promise.all([
    getPart(part.id),
    stockCount(part.id, availableOnly),
  ]);
  return {
    id: part.id,
    sku: part.sku,
    name: part.name,
    imageUrl: imageUrls(part.metadata)[0] ?? null,
    isProduct: detail.components.length > 0,
    stockCount: stock,
  };
}

async function allParts(search: string) {
  const parts: Part[] = [];
  for (let offset = 0; ; offset += 100) {
    const list = await get<List<Part>>(
      `/parts?${qs({ search, limit: 100, offset })}`,
    );
    parts.push(...list.data);
    if (list.data.length === 0 || parts.length >= list.total) return parts;
  }
}

async function toEntries(
  parts: Part[],
  availableOnly: boolean,
  batchSize = 10,
) {
  const entries: CatalogEntry[] = [];
  for (let i = 0; i < parts.length; i += batchSize) {
    entries.push(
      ...(await Promise.all(
        parts
          .slice(i, i + batchSize)
          .map((part) => toEntry(part, availableOnly)),
      )),
    );
  }
  return entries;
}

export async function getCatalog(query: CatalogQuery, availableOnly: boolean) {
  const offset = (query.page - 1) * CATALOG_PAGE_SIZE;

  if (query.type === "all" && query.stock === "all") {
    const list = await get<List<Part>>(
      `/parts?${qs({ search: query.search, limit: CATALOG_PAGE_SIZE, offset })}`,
    );
    return {
      entries: await Promise.all(
        list.data.map((part) => toEntry(part, availableOnly)),
      ),
      total: list.total,
    };
  }

  // PAPI cannot filter by product/part or stock yet, so filter the matching SKUs here
  const entries = (
    await toEntries(await allParts(query.search), availableOnly)
  ).filter(
    (entry) =>
      (query.type === "all" ||
        (query.type === "products") === entry.isProduct) &&
      (query.stock === "all" || entry.stockCount > 0),
  );
  return {
    entries: entries.slice(offset, offset + CATALOG_PAGE_SIZE),
    total: entries.length,
  };
}

// Bill of materials, resolved recursively. Each SKU is fetched once even when
// it appears in several branches.
export async function getBomTree(part: PartDetail, maxDepth = 10) {
  const cache = new Map<string, Promise<PartDetail>>([
    [part.id, Promise.resolve(part)],
  ]);
  const load = (id: string) => {
    if (!cache.has(id)) cache.set(id, getPart(id));
    return cache.get(id)!;
  };

  async function build(
    detail: PartDetail,
    path: Set<string>,
  ): Promise<BomNode[]> {
    return Promise.all(
      detail.components.map(async (component) => {
        const child = await load(component.child_part_id);
        const canExpand = !path.has(child.id) && path.size < maxDepth;
        return {
          id: component.id,
          slot: component.slot,
          quantity: component.required_quantity,
          part: { id: child.id, sku: child.sku, name: child.name },
          children: canExpand
            ? await build(child, new Set(path).add(child.id))
            : [],
        };
      }),
    );
  }

  return build(part, new Set([part.id]));
}
