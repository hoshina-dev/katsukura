"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";

import { type Metadata, skuHref } from "@/libs/inventory";
import {
  archiveItem,
  createComponent,
  createItems,
  createPart,
  deleteComponent,
  installItem,
  listItems,
  type NewComponent,
  ITEMS_TAG,
  type NewPart,
  PapiError,
  partTag,
  removeInstallation,
  searchParts,
  updateComponent,
  updateItem,
  updatePart,
  validateMetadata,
} from "@/libs/papiRest";

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

export async function checkMetadata(
  metadata: Record<string, unknown>,
): Promise<SubmitResult> {
  try {
    return { metadata: await validateMetadata(metadata) };
  } catch (error) {
    return toResult(error);
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
  redirect(skuHref(sku, "/backoffice"));
}

export async function savePart(
  partId: string,
  patch: { description: string | null; metadata: Record<string, unknown> },
): Promise<SubmitResult> {
  try {
    await updatePart(partId, patch);
  } catch (error) {
    return toResult(error);
  }
  updateTag(partTag(partId));
  return {};
}

export async function addItems(partId: string, count: number) {
  try {
    await createItems(partId, count);
  } catch (error) {
    return toResult(error);
  }
  updateTag(ITEMS_TAG);
  return {};
}

export async function deleteItems(partId: string, itemIds: string[]) {
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
  patch: {
    location: string | null;
    assembly_state: "draft" | "complete";
    metadata: Record<string, unknown>;
  },
): Promise<SubmitResult> {
  try {
    await updateItem(itemId, patch);
  } catch (error) {
    return toResult(error);
  }
  updateTag(ITEMS_TAG);
  return {};
}

// Items of a SKU that are not installed anywhere, for the install picker
export async function findAvailableItems(partId: string, search: string) {
  const list = await listItems(partId, {
    available: true,
    search: search.trim() || undefined,
    limit: 50,
  });
  return { items: list.data, total: list.total };
}

// The API rejects items that were installed elsewhere in the meantime
export async function installItems(
  parentItemId: string,
  partComponentId: string,
  itemIds: string[],
) {
  const result = await inBatches(
    itemIds,
    (id) => installItem(parentItemId, partComponentId, id),
    "installed",
  );
  updateTag(ITEMS_TAG);
  return result;
}

export async function uninstallItem(
  parentItemId: string,
  installationId: string,
): Promise<SubmitResult> {
  try {
    await removeInstallation(parentItemId, installationId);
  } catch (error) {
    return toResult(error);
  }
  updateTag(ITEMS_TAG);
  return {};
}

export async function findParts(search: string) {
  const list = await searchParts(search.trim());
  return list.data.map(({ id, sku, name }) => ({ id, sku, name }));
}

// BOM changes can demote existing items, so stock counts are expired too
async function changeBom(partId: string, change: () => Promise<unknown>) {
  try {
    await change();
  } catch (error) {
    return toResult(error);
  }
  updateTag(partTag(partId));
  updateTag(ITEMS_TAG);
  return {};
}

export async function addBomChild(
  partId: string,
  component: NewComponent,
): Promise<SubmitResult> {
  return changeBom(partId, () => createComponent(partId, component));
}

export async function updateBomChild(
  partId: string,
  componentId: string,
  patch: { required_quantity: number; is_optional: boolean },
): Promise<SubmitResult> {
  return changeBom(partId, () => updateComponent(partId, componentId, patch));
}

export async function deleteBomChild(
  partId: string,
  componentId: string,
): Promise<SubmitResult> {
  return changeBom(partId, () => deleteComponent(partId, componentId));
}
