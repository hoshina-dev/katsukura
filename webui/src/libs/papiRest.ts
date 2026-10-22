// PAPI REST client, only used in server components and server actions

import "server-only";

import {
  type BomNode,
  CATALOG_PAGE_SIZE,
  type CatalogEntry,
  type CatalogQuery,
  imageUrl,
  type Item,
  type ItemDetail,
  type List,
  type Part,
  type PartDetail,
  type TreeNode,
} from "./inventory";

const API_URL = new URL(
  "/api/v1",
  process.env.PAPI_URL || "http://localhost:8082",
).href;

// Short cache for lookups that are repeated across catalog pages
const LOOKUP_TTL_SECONDS = 30;

export class PapiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function isMissing(error: unknown) {
  return (
    error instanceof PapiError && (error.status === 400 || error.status === 404)
  );
}

async function get<T>(path: string, ttl?: number): Promise<T> {
  const response = await fetch(
    API_URL + path,
    ttl ? { next: { revalidate: ttl } } : { cache: "no-store" },
  );
  const body = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new PapiError(
      body?.error?.message || `PAPI request failed (${response.status})`,
      response.status,
    );
  }
  return body as T;
}

function qs(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  return search.toString();
}

export function getPart(id: string) {
  return get<PartDetail>(`/parts/${id}`, LOOKUP_TTL_SECONDS);
}

export async function findPartBySku(sku: string) {
  const list = await get<List<Part>>(
    `/parts?${qs({ search: sku, limit: 50 })}`,
  );
  const match = list.data.find((part) => part.sku === sku);
  return match ? getPart(match.id) : null;
}

export function listItems(partId: string, limit = 100) {
  return get<List<Item>>(`/inventory?${qs({ part_id: partId, limit })}`);
}

export function getItem(id: string) {
  return get<ItemDetail>(`/inventory/${id}`);
}

export function getItemTree(id: string) {
  return get<TreeNode>(`/inventory/${id}/tree?depth=20`);
}

// Catalog

// Availability rule: number of non-archived inventory items for the SKU.
// Replace this when PAPI exposes real availability.
async function stockCount(partId: string) {
  const list = await get<List<Item>>(
    `/inventory?${qs({ part_id: partId, limit: 1 })}`,
    LOOKUP_TTL_SECONDS,
  );
  return list.total;
}

async function toEntry(part: Part): Promise<CatalogEntry> {
  const [detail, stock] = await Promise.all([
    getPart(part.id),
    stockCount(part.id),
  ]);
  return {
    id: part.id,
    sku: part.sku,
    name: part.name,
    imageUrl: imageUrl(part.metadata),
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

async function toEntries(parts: Part[], batchSize = 10) {
  const entries: CatalogEntry[] = [];
  for (let i = 0; i < parts.length; i += batchSize) {
    entries.push(
      ...(await Promise.all(parts.slice(i, i + batchSize).map(toEntry))),
    );
  }
  return entries;
}

export async function getCatalog(query: CatalogQuery) {
  const offset = (query.page - 1) * CATALOG_PAGE_SIZE;

  if (query.type === "all" && query.stock === "all") {
    const list = await get<List<Part>>(
      `/parts?${qs({ search: query.search, limit: CATALOG_PAGE_SIZE, offset })}`,
    );
    return {
      entries: await Promise.all(list.data.map(toEntry)),
      total: list.total,
    };
  }

  // PAPI cannot filter by product/part or stock yet, so filter the matching SKUs here
  const entries = (await toEntries(await allParts(query.search))).filter(
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
          optional: component.is_optional,
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
