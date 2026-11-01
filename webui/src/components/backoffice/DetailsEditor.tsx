"use client";

import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import type { SubmitResult } from "@/app/actions";
import type { Metadata } from "@/libs/inventory";

import { ChangedLabel, MetadataFields, useMetadataForm } from "./Metadata";
import { Section } from "./Section";

interface DetailsEditorProps {
  title: string;
  // Optional text field saved next to the metadata; blank saves null
  text?: { label: string; value: string | null };
  metadata: Metadata;
  // Server action bound to the part or item being edited
  save: (
    metadata: Record<string, unknown>,
    text: string | null,
  ) => Promise<SubmitResult>;
}

// Save validates on the backend; schema errors show on their fields
export function DetailsEditor({
  title,
  text,
  metadata,
  save,
}: DetailsEditorProps) {
  const router = useRouter();
  const form = useMetadataForm(metadata);
  const [value, setValue] = useState(text?.value ?? "");
  const [savedValue, setSavedValue] = useState(value.trim());
  const [justSaved, setJustSaved] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const textChanged = value.trim() !== savedValue;
  const dirty = form.dirty || textChanged;

  // Full page loads and tab closes only; in-app links don't fire this
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return (
    <Section
      title={title}
      actions={
        dirty && (
          <Badge color="orange" variant="light" radius="sm">
            Unsaved changes
          </Badge>
        )
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = form.toMetadata();
          if (parsed.error !== undefined) {
            setError(parsed.error);
            return;
          }
          startTransition(async () => {
            const result = await save(parsed.metadata, value.trim() || null);
            setFieldErrors(result.fields ?? {});
            setError(
              result.error ??
                (result.fields?.[""] || null) ??
                (result.fields ? "Some fields need fixing" : null),
            );
            if (!result.error && !result.fields) {
              form.commit();
              setSavedValue(value.trim());
              setJustSaved(true);
              router.refresh();
            }
          });
        }}
        onChange={() => setJustSaved(false)}
      >
        <Stack gap="md">
          {text && (
            <Textarea
              label={
                <ChangedLabel changed={textChanged}>{text.label}</ChangedLabel>
              }
              value={value}
              onChange={(event) => setValue(event.currentTarget.value)}
              autosize
              minRows={2}
            />
          )}
          <MetadataFields
            form={form}
            fieldErrors={fieldErrors}
            compact
            trackChanges
          />
          {error && (
            <Alert color="red" variant="light">
              {error}
            </Alert>
          )}
          {/* Sticks to the viewport bottom while there is something to save */}
          <Box
            pos={dirty ? "sticky" : undefined}
            bottom={0}
            bg="white"
            py="sm"
            mx="-md"
            px="md"
            mb="-md"
            style={{
              zIndex: 2,
              borderTop: dirty ? "1px solid var(--app-line)" : undefined,
            }}
          >
            <Group justify="flex-end" gap="sm">
              {dirty && (
                <Text size="sm" c="orange.8">
                  Unsaved changes
                </Text>
              )}
              {justSaved && !dirty && (
                <Text size="sm" c="signal.8">
                  Saved
                </Text>
              )}
              <Button
                type="submit"
                size="sm"
                loading={pending}
                disabled={!dirty}
              >
                Save details
              </Button>
            </Group>
          </Box>
        </Stack>
      </form>
    </Section>
  );
}
