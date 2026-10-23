"use client";

import {
  Button,
  Group,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { saveItem } from "@/app/backoffice/actions";
import type { Item, Metadata } from "@/libs/inventory";

import { errorLines, MetadataInput, parseMetadata } from "./Metadata";
import { Section } from "./Section";

interface ItemEditorProps {
  itemId: string;
  location: string | null;
  assemblyState: Item["assembly_state"];
  metadata: Metadata;
}

// Save validates on the backend, including that a complete item is fully assembled
export function ItemEditor({
  itemId,
  location,
  assemblyState,
  metadata,
}: ItemEditorProps) {
  const router = useRouter();
  const [state, setState] = useState(assemblyState);
  const [text, setText] = useState(JSON.stringify(metadata, null, 2));
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  // The API can demote the item when its components change
  useEffect(() => setState(assemblyState), [assemblyState]);

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
                assembly_state: state,
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
          <Group align="flex-end" gap="lg">
            <TextInput
              name="location"
              label="Location"
              defaultValue={location ?? ""}
              style={{ flex: 1 }}
            />
            <div>
              <Text size="sm" fw={500} mb={4}>
                Assembly state
              </Text>
              <SegmentedControl
                aria-label="Assembly state"
                value={state}
                onChange={(value) => {
                  setState(value as Item["assembly_state"]);
                  setSaved(false);
                }}
                data={[
                  { value: "draft", label: "Draft" },
                  { value: "complete", label: "Complete" },
                ]}
              />
            </div>
          </Group>
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
