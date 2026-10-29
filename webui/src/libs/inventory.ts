// Shared PAPI REST types and helpers (safe to import from client components)

// Metadata keys and types are defined by the API's schema
// (GET /metadata/schema); the UI only reads image_urls itself
export type Metadata = Record<string, unknown> & {
  image_urls?: string[] | null;
};

export type Part = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  metadata: Metadata;
  archived_at: string | null;
  // Filled on part lists and details
  stock?: Stock;
};

// Counts of a SKU's items
export type Stock = {
  total: number;
  // Installed in another item
  in_use: number;
  // Not installed anywhere
  available: number;
};

export type PartComponent = {
  id: string;
  parent_part_id: string;
  child_part_id: string;
  slot: string;
  required_quantity: number;
  child_part?: Part;
};

export type PartDetail = Part & { components: PartComponent[] };

export type Item = {
  id: string;
  part_id: string;
  serial_number: string | null;
  location: string | null;
  metadata: Metadata;
  archived_at: string | null;
  part?: Part;
  // Where the item is installed, with parent_item loaded; absent when free
  parent?: Installation;
};

export type Installation = {
  id: string;
  parent_item_id: string;
  component_item_id: string;
  part_component_id: string;
  position: string | null;
  removed_at: string | null;
  component_item?: Item;
  parent_item?: Item;
};

export type ItemDetail = Item & {
  components: Installation[];
};

export type List<T> = {
  data: T[];
  total: number;
  limit: number;
  offset: number;
};

// Catalog

export const CATALOG_PAGE_SIZE = 12;
// Rows fetched per step by the scrolling list view
export const LIST_PAGE_SIZE = 25;
export const ITEMS_PAGE_SIZE = 20;
export const ITEMS_PAGE_PARAM = "items_page";

export type CatalogView = "grid" | "table";
export type CatalogSort = "default" | "name" | "amount";

export type CatalogQuery = {
  search: string;
  sort: CatalogSort;
  page: number;
};

export type CatalogEntry = {
  id: string;
  sku: string;
  name: string;
  imageUrl: string | null;
  stock: Stock;
};

export type SearchParams = Record<string, string | string[] | undefined>;

function param(params: SearchParams, key: string) {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export function pageParam(params: SearchParams, key: string) {
  const page = Number.parseInt(param(params, key), 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

export function parseCatalogQuery(params: SearchParams): CatalogQuery {
  const sort = param(params, "sort");
  return {
    search: param(params, "q").trim(),
    sort: sort === "name" || sort === "amount" ? sort : "default",
    page: pageParam(params, "page"),
  };
}

export function parseCatalogView(params: SearchParams): CatalogView {
  return param(params, "view") === "grid" ? "grid" : "table";
}

// Part image uploads; the server action checks these again
export const MAX_IMAGE_BYTES = 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function imageUrls(metadata: Metadata) {
  return (metadata.image_urls ?? []).filter(
    (url) => typeof url === "string" && url,
  );
}

export function skuHref(sku: string) {
  return `/parts/${encodeURIComponent(sku)}`;
}

export function itemHref(sku: string, itemId: string) {
  return `${skuHref(sku)}/items/${itemId}`;
}

export function serialLabel(item?: { serial_number: string | null }) {
  return item?.serial_number ?? "Unserialized";
}

// Whole number of at least 1, e.g. a quantity typed into a NumberInput
export function isPositiveInt(value: unknown) {
  return Number.isInteger(Number(value)) && Number(value) >= 1;
}

export function unitsLabel(count: number) {
  return `${count} ${count === 1 ? "unit" : "units"}`;
}

// Default slot name for a new BOM row, e.g. "Door Handle" -> "door_handle"
export function slotName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}
