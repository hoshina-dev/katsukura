"use client";

import { Button, Group, Stack, Text, Textarea } from "@mantine/core";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { savePart } from "@/app/backoffice/actions";
import type { Metadata } from "@/libs/inventory";

import { errorLines, MetadataInput, parseMetadata } from "./Metadata";
import { Section } from "./Section";

interface PartEditorProps {
  partId: string;
  description: string | null;
  metadata: Metadata;
}

// Save validates on the backend; schema errors are listed under the metadata
export function PartEditor({ partId, description, metadata }: PartEditorProps) {
  const router = useRouter();
  const [text, setText] = useState(JSON.stringify(metadata, null, 2));
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <Section title="Details">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const value = String(form.get("description") ?? "").trim() || null;
          setSaved(false);
          const parsed = parseMetadata(text);
          if (!parsed.metadata) {
            setErrors([parsed.error]);
            return;
          }
          startTransition(async () => {
            const lines = errorLines(
              await savePart(partId, {
                description: value,
                metadata: parsed.metadata,
              }),
            );
            setErrors(lines);
            if (lines.length === 0) {
              setSaved(true);
              router.refresh();
            }
          });
        }}
      >
        <Stack gap="md">
          <Textarea
            name="description"
            label="Description"
            defaultValue={description ?? ""}
            autosize
            minRows={2}
          />
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
