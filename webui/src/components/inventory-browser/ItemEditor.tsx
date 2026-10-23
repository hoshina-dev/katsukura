"use client";

import { Button, Group, Stack, Text, TextInput } from "@mantine/core";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { saveItem } from "@/app/backoffice/actions";
import type { Metadata } from "@/libs/inventory";

import { errorLines, MetadataInput, parseMetadata } from "./Metadata";
import { Section } from "./Section";

interface ItemEditorProps {
  itemId: string;
  location: string | null;
  metadata: Metadata;
}

// Save validates on the backend; schema errors are listed under the metadata
export function ItemEditor({ itemId, location, metadata }: ItemEditorProps) {
  const router = useRouter();
  const [text, setText] = useState(JSON.stringify(metadata, null, 2));
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <Section title="Edit item">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const place = String(form.get("location") ?? "").trim() || null;
          setSaved(false);
          const parsed = parseMetadata(text);
          if (!parsed.metadata) {
            setErrors([parsed.error]);
            return;
          }
          startTransition(async () => {
            const lines = errorLines(
              await saveItem(itemId, {
                location: place,
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
          <TextInput
            name="location"
            label="Location"
            defaultValue={location ?? ""}
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
