// Shared PAPI REST types and helpers (safe to import from client components)

export type Part = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  metadata: Record<string, unknown>;
  archived_at: string | null;
};

export type PartComponent = {
  id: string;
  parent_part_id: string;
  child_part_id: string;
  slot: string;
  required_quantity: number;
  is_optional: boolean;
  child_part?: Part;
};

export type PartDetail = Part & { components: PartComponent[] };

export type Item = {
  id: string;
  part_id: string;
  serial_number: string | null;
  assembly_state: "draft" | "complete";
  location: string | null;
  metadata: Record<string, unknown>;
  archived_at: string | null;
  part?: Part;
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
  parent: Installation | null;
  components: Installation[];
};

export type TreeNode = {
  item: Item;
  children: TreeNode[];
  truncated?: boolean;
};

export type List<T> = {
  data: T[];
  total: number;
  limit: number;
  offset: number;
};

export type BomNode = {
  id: string;
  slot: string;
  quantity: number;
  optional: boolean;
  part: Pick<Part, "id" | "sku" | "name">;
  children: BomNode[];
};

// Catalog

export const CATALOG_PAGE_SIZE = 6;

export type CatalogType = "all" | "products" | "parts";
export type CatalogStock = "all" | "in";
export type CatalogView = "grid" | "table";

export type CatalogQuery = {
  search: string;
  type: CatalogType;
  stock: CatalogStock;
  page: number;
};

export type CatalogEntry = {
  id: string;
  sku: string;
  name: string;
  imageUrl: string | null;
  isProduct: boolean;
  stockCount: number;
};

type SearchParams = Record<string, string | string[] | undefined>;

function param(params: SearchParams, key: string) {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export function parseCatalogQuery(params: SearchParams): CatalogQuery {
  const type = param(params, "type");
  const page = Number.parseInt(param(params, "page"), 10);
  return {
    search: param(params, "q").trim(),
    type: type === "products" || type === "parts" ? type : "all",
    stock: param(params, "stock") === "in" ? "in" : "all",
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

export function parseCatalogView(params: SearchParams): CatalogView {
  return param(params, "view") === "table" ? "table" : "grid";
}

export function imageUrl(metadata: Record<string, unknown>) {
  const url = metadata.image_url;
  return typeof url === "string" && url ? url : null;
}

export function skuHref(sku: string) {
  return `/inventory/${encodeURIComponent(sku)}`;
}

export function itemHref(sku: string, itemId: string) {
  return `${skuHref(sku)}/items/${itemId}`;
}

export function unitsLabel(count: number) {
  return `${count} ${count === 1 ? "unit" : "units"}`;
}

export function assemblyLabel(state: Item["assembly_state"]) {
  return state === "complete" ? "Complete" : "Draft";
}
