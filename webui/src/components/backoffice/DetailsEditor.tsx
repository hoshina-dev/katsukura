"use client";

import { Alert, Button, Group, Stack, Text } from "@mantine/core";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";

import type { SubmitResult } from "@/app/actions";
import type { Metadata } from "@/libs/inventory";

import { MetadataFields, useMetadataForm } from "./Metadata";
import { Section } from "./Section";

interface DetailsEditorProps {
  title: string;
  // An input named "value"; its trimmed text, or null when blank, is saved
  field: ReactNode;
  metadata: Metadata;
  // Server action bound to the part or item being edited
  save: (
    value: string | null,
    metadata: Record<string, unknown>,
  ) => Promise<SubmitResult>;
}

// Save validates on the backend; schema errors show on their fields
export function DetailsEditor({
  title,
  field,
  metadata,
  save,
}: DetailsEditorProps) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const form = useMetadataForm(metadata, () => setSaved(false));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Section title={title}>
      <form
        onChange={() => setSaved(false)}
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const value = String(data.get("value") ?? "").trim() || null;
          setSaved(false);
          const parsed = form.toMetadata();
          if (parsed.error !== undefined) {
            setError(parsed.error);
            return;
          }
          startTransition(async () => {
            const result = await save(value, parsed.metadata);
            setFieldErrors(result.fields ?? {});
            setError(
              result.error ??
                (result.fields?.[""] || null) ??
                (result.fields ? "Some fields need fixing" : null),
            );
            if (!result.error && !result.fields) {
              setSaved(true);
              router.refresh();
            }
          });
        }}
      >
        <Stack gap="md">
          {field}
          <MetadataFields form={form} fieldErrors={fieldErrors} compact />
          {error && (
            <Alert color="red" variant="light">
              {error}
            </Alert>
          )}
          <Group justify="flex-end" gap="sm">
            {saved && (
              <Text size="sm" c="signal.8">
                Saved
              </Text>
            )}
            <Button type="submit" size="sm" loading={pending}>
              Save details
            </Button>
          </Group>
        </Stack>
      </form>
    </Section>
  );
}
