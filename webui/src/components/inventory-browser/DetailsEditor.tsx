"use client";

import { Button, Group, Stack, Text } from "@mantine/core";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";

import type { SubmitResult } from "@/app/backoffice/actions";
import type { Metadata } from "@/libs/inventory";

import { errorLines, MetadataInput, parseMetadata } from "./Metadata";
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

// Save validates on the backend; schema errors are listed under the metadata
export function DetailsEditor({
  title,
  field,
  metadata,
  save,
}: DetailsEditorProps) {
  const router = useRouter();
  const [text, setText] = useState(JSON.stringify(metadata, null, 2));
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <Section title={title}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const value = String(form.get("value") ?? "").trim() || null;
          setSaved(false);
          const parsed = parseMetadata(text);
          if (!parsed.metadata) {
            setErrors([parsed.error]);
            return;
          }
          startTransition(async () => {
            const lines = errorLines(await save(value, parsed.metadata));
            setErrors(lines);
            if (lines.length === 0) {
              setSaved(true);
              router.refresh();
            }
          });
        }}
      >
        <Stack gap="md">
          {field}
          <MetadataInput
            value={text}
            onChange={(value) => {
              setText(value);
              setSaved(false);
            }}
            errors={errors}
          />
          <Group justify="flex-end">
            {saved && (
              <Text size="sm" c="green.7">
                Saved
              </Text>
            )}
            <Button type="submit" loading={pending}>
              Save
            </Button>
          </Group>
        </Stack>
      </form>
    </Section>
  );
}
