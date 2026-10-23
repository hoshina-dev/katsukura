"use client";

import { Button, Group, Stack, Text, Textarea } from "@mantine/core";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { savePart, type SubmitResult } from "@/app/backoffice/actions";
import type { Metadata } from "@/libs/inventory";

import { Section } from "./Section";

interface PartEditorProps {
  partId: string;
  description: string | null;
  metadata: Metadata;
}

// One line per problem, e.g. "category: got string, want null or array"
function errorLines(result: SubmitResult) {
  const lines = Object.entries(result.fields ?? {}).map(([key, reason]) =>
    key ? `${key}: ${reason}` : reason,
  );
  return result.error ? [result.error, ...lines] : lines;
}

function parseMetadata(text: string) {
  try {
    const value: unknown = JSON.parse(text);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return { metadata: value as Record<string, unknown> };
    }
    return { error: "metadata must be a JSON object" };
  } catch (error) {
    return { error: `invalid JSON: ${(error as Error).message}` };
  }
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
          <div>
            <Textarea
              label="Metadata"
              value={text}
              onChange={(event) => {
                setText(event.currentTarget.value);
                setSaved(false);
              }}
              autosize
              minRows={6}
              styles={{
                input: { fontFamily: "var(--mantine-font-family-monospace)" },
              }}
            />
            {errors.map((line) => (
              <Text key={line} size="xs" c="red" mt={4}>
                *{line}
              </Text>
            ))}
          </div>

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
