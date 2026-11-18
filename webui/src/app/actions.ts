"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";

import {
  type CatalogQuery,
  IMAGE_TYPES,
  LIST_PAGE_SIZE,
  MAX_IMAGE_BYTES,
  type Metadata,
  skuHref,
} from "@/libs/inventory";
import {
  archiveItem,
  archivePart,
  createComponent,
  createItems,
  createPart,
  deleteComponent,
  getCatalog,
  getPart,
  listItems,
  type NewComponent,
  ITEMS_TAG,
  type NewPart,
  ApiError,
  partTag,
  replaceComponent,
  searchParts,
  updateComponent,
  updateItem,
  updatePart,
} from "@/libs/katsukuraApi";
import { uploadImage } from "@/libs/s3Client";

export type SubmitResult = {
  error?: string;
  // Error message per metadata key, from the API's error details
  fields?: Record<string, string>;
  metadata?: Metadata;
};

// Parallel API calls per batch when one action touches many rows
const BATCH_SIZE = 10;

// A network failure becomes a form error too, so the caller keeps its draft
function toResult(error: unknown): SubmitResult {
  if (!(error instanceof ApiError)) {
    console.error("API request failed", error);
    return { error: "Could not reach the inventory API. Try again." };
  }
  if (error.details.length === 0) return { error: error.message };
  const fields: Record<string, string> = {};
  for (const { field, message } of error.details) {
    fields[field] = fields[field] ? `${fields[field]}; ${message}` : message;
  }
  return { fields };
}

// Runs task for every value, BATCH_SIZE at a time, and summarises failures
async function inBatches<T>(
  values: T[],
  task: (value: T) => Promise<unknown>,
  verb: string,
): Promise<{ error?: string; failed: T[] }> {
  const failures: string[] = [];
  const failed: T[] = [];
  for (let i = 0; i < values.length; i += BATCH_SIZE) {
    const batch = values.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(task));
    results.forEach((result, j) => {
      if (result.status === "rejected") {
        if (!(result.reason instanceof ApiError)) throw result.reason;
        failures.push(result.reason.message);
        failed.push(batch[j]);
      }
    });
  }
  if (failures.length === 0) return { failed };
  return {
    error: `${failures.length} of ${values.length} could not be ${verb}: ${failures[0]}`,
    failed,
  };
}

// More rows of the scrolling catalog table, after the ones already shown
export async function loadCatalogPage(query: CatalogQuery, offset: number) {
  return getCatalog(query, LIST_PAGE_SIZE, offset);
}

// One file per call, so each stays under the server action body limit
export async function uploadPartImage(
  form: FormData,
): Promise<{ url?: string; error?: string }> {
  const file = form.get("file");
  if (!(file instanceof File)) return { error: "No file was received" };
  if (!IMAGE_TYPES.includes(file.type)) {
    return { error: `${file.name}: use a JPEG, PNG or WebP image` };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { error: `${file.name} is larger than 1 MB` };
  }
  try {
    return { url: await uploadImage(file, "part-image") };
  } catch (error) {
    console.error("part image upload failed", error);
    return { error: `${file.name} could not be uploaded to storage` };
  }
}

// Returns errors, or redirects to the new part's edit page on success
export async function addPart(part: NewPart): Promise<SubmitResult> {
  let sku: string;
  try {
    ({ sku } = await createPart(part));
  } catch (error) {
    return toResult(error);
  }
  redirect(skuHref(sku));
}

// Runs one API change, then expires the given cache tags
async function mutate(
  change: () => Promise<unknown>,
  ...tags: string[]
): Promise<SubmitResult> {
  try {
    await change();
  } catch (error) {
    return toResult(error);
  }
  for (const tag of tags) updateTag(tag);
  return {};
}

// Why deleting the part would be refused, so the dialog can say so first.
// Mirrors the API's ArchivePart check; a parent that ever had items has slot
// history, so only deleting that parent unblocks this one.
export async function partDeleteBlocker(partId: string) {
  const part = await getPart(partId);
  const use = part.parents.find(
    (row) => row.parent_part && !row.parent_part.archived_at,
  );
  if (!use?.parent_part) return null;
  const parent = use.parent_part;
  const history = await listItems(parent.id, {
    limit: 1,
    includeArchived: true,
  });
  return history.total > 0
    ? `${part.name} is used in the bill of materials of ${parent.name}. Delete ${parent.name} first; its bill of materials can no longer change.`
    : `${part.name} is used in the bill of materials of ${parent.name}. Remove it from that bill of materials first.`;
}

export async function deletePart(partId: string) {
  return mutate(() => archivePart(partId), partTag(partId), ITEMS_TAG);
}

export async function savePart(
  partId: string,
  metadata: Record<string, unknown>,
  description: string | null,
  name?: string,
) {
  return mutate(
    () => updatePart(partId, { description, metadata, name }),
    partTag(partId),
  );
}

export async function addItems(
  partId: string,
  count: number,
  serialNumbers?: string[],
) {
  return mutate(() => createItems(partId, count, serialNumbers), ITEMS_TAG);
}

export async function deleteItems(itemIds: string[]) {
  const result = await inBatches(itemIds, archiveItem, "deleted");
  updateTag(ITEMS_TAG);
  return result;
}

export async function removeBom(partId: string, componentIds: string[]) {
  const result = await inBatches(
    componentIds,
    (id) => deleteComponent(partId, id),
    "removed",
  );
  updateTag(partTag(partId));
  updateTag(ITEMS_TAG);
  return result;
}

export async function saveItem(
  itemId: string,
  metadata: Record<string, unknown>,
) {
  return mutate(() => updateItem(itemId, { metadata }), ITEMS_TAG);
}

// Items of a SKU that are not installed anywhere, for the replace picker
export async function findAvailableItems(partId: string, search: string) {
  const list = await listItems(partId, {
    available: true,
    search: search.trim() || undefined,
    limit: 50,
  });
  return { items: list.data, total: list.total };
}

// The API rejects an item that was installed elsewhere in the meantime
export async function replaceItem(
  parentItemId: string,
  installationId: string,
  itemId: string,
) {
  return mutate(
    () => replaceComponent(parentItemId, installationId, itemId),
    ITEMS_TAG,
  );
}

// Candidates for a BOM row of partId, which can't contain itself
export async function findParts(search: string, partId: string) {
  const list = await searchParts(search.trim());
  const parts = list.data
    .filter((part) => part.id !== partId)
    .map(({ id, sku, name }) => ({ id, sku, name }));
  return { parts, more: list.total > list.data.length };
}

// BOM changes can demote existing items, so stock counts are expired too
export async function addBomChild(partId: string, component: NewComponent) {
  return mutate(
    () => createComponent(partId, component),
    partTag(partId),
    ITEMS_TAG,
  );
}

export async function updateBomChild(
  partId: string,
  componentId: string,
  patch: { required_quantity: number },
) {
  return mutate(
    () => updateComponent(partId, componentId, patch),
    partTag(partId),
    ITEMS_TAG,
  );
}

export async function deleteBomChild(partId: string, componentId: string) {
  return mutate(
    () => deleteComponent(partId, componentId),
    partTag(partId),
    ITEMS_TAG,
  );
}
