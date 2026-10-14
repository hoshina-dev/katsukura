export type Part = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  metadata: Record<string, unknown>;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};
export type Component = {
  id: string;
  parent_part_id: string;
  child_part_id: string;
  slot: string;
  required_quantity: number;
  is_optional: boolean;
  child_part?: Part;
  parent_part?: Part;
  created_at: string;
  updated_at: string;
};
export type Item = {
  id: string;
  part_id: string;
  serial_number: string | null;
  assembly_state: "draft" | "complete";
  location: string | null;
  metadata: Record<string, unknown>;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  part?: Part;
};
export type Installation = {
  id: string;
  parent_item_id: string;
  component_item_id: string;
  part_component_id: string;
  position: string | null;
  installed_at: string;
  removed_at: string | null;
  bom_snapshot: Record<string, unknown>;
  component_item?: Item;
  parent_item?: Item;
};
export type PartDetail = Part & {
  components: Component[];
  parents?: Component[];
};
export type ItemDetail = Item & {
  parent: Installation | null;
  components: Installation[];
  history: Installation[];
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
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch("/api/v1" + path, {
    method,
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    throw new Error(
      response.ok
        ? "The server returned an invalid response."
        : `Request failed (${response.status}).`,
    );
  }
  if (!response.ok)
    throw new Error(
      (data as { error?: { message?: string } })?.error?.message ||
        `Request failed (${response.status}).`,
    );
  return data as T;
}
export function query(
  params: Record<string, string | number | boolean | undefined>,
) {
  const value = new URLSearchParams();
  for (const [key, val] of Object.entries(params))
    if (val !== undefined && val !== "") value.set(key, String(val));
  return "?" + value;
}
export function parseMetadata(value: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Metadata must be valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("Metadata must be a JSON object, such as {}.");
  return parsed as Record<string, unknown>;
}
export function metadataFields(
  value: string,
  initial?: string,
): { metadata?: Record<string, unknown> } {
  return value === initial ? {} : { metadata: parseMetadata(value) };
}
export function missingQuantity(
  component: Component,
  installations: Installation[],
) {
  return Math.max(
    0,
    component.required_quantity -
      installations.filter(
        (row) => row.part_component_id === component.id && !row.removed_at,
      ).length,
  );
}
export function itemLabel(item: Item) {
  return item.serial_number || item.id.slice(0, 8);
}
