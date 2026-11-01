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
  listItems,
  type NewComponent,
  ITEMS_TAG,
  type NewPart,
  PapiError,
  partTag,
  replaceComponent,
  searchParts,
  updateComponent,
  updateItem,
  updatePart,
} from "@/libs/papiRest";
import { uploadImage } from "@/libs/s3Client";

export type SubmitResult = {
  error?: string;
  // Error message per metadata key, from the API's error details
  fields?: Record<string, string>;
  metadata?: Metadata;
};

// Parallel API calls per batch when one action touches many rows
const BATCH_SIZE = 10;

function toResult(error: unknown): SubmitResult {
  if (!(error instanceof PapiError)) throw error;
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
) {
  const failures: string[] = [];
  for (let i = 0; i < values.length; i += BATCH_SIZE) {
    const results = await Promise.allSettled(
      values.slice(i, i + BATCH_SIZE).map(task),
    );
    for (const result of results) {
      if (result.status === "rejected") {
        if (!(result.reason instanceof PapiError)) throw result.reason;
        failures.push(result.reason.message);
      }
    }
  }
  if (failures.length === 0) return {};
  return {
    error: `${failures.length} of ${values.length} could not be ${verb}: ${failures[0]}`,
  };
}

// One more step of the scrolling catalog table
export async function loadCatalogPage(query: CatalogQuery) {
  return getCatalog(query, LIST_PAGE_SIZE);
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

export async function deletePart(partId: string) {
  return mutate(() => archivePart(partId), partTag(partId), ITEMS_TAG);
}

export async function savePart(
  partId: string,
  metadata: Record<string, unknown>,
  description: string | null,
) {
  return mutate(
    () => updatePart(partId, { description, metadata }),
    partTag(partId),
  );
}

export async function addItems(partId: string, serialNumbers: string[]) {
  return mutate(() => createItems(partId, serialNumbers), ITEMS_TAG);
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

export async function findParts(search: string) {
  const list = await searchParts(search.trim());
  return list.data.map(({ id, sku, name }) => ({ id, sku, name }));
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
