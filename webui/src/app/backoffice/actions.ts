"use server";

import { redirect } from "next/navigation";

import { type Metadata, metadataErrors } from "@/libs/inventory";
import {
  createPart,
  type NewPart,
  PapiError,
  validateMetadata,
} from "@/libs/papiRest";

export type SubmitResult = {
  error?: string;
  // Short error message per metadata key
  fields?: Record<string, string>;
  metadata?: Metadata;
};

function toResult(error: unknown): SubmitResult {
  if (!(error instanceof PapiError)) throw error;
  const fields = metadataErrors(error.message);
  return fields ? { fields } : { error: error.message };
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

// Returns errors, or redirects back to the backoffice on success
export async function addPart(part: NewPart): Promise<SubmitResult> {
  try {
    await createPart(part);
  } catch (error) {
    return toResult(error);
  }
  redirect("/backoffice");
}
