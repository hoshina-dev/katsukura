"use client";

import {
  Alert,
  Box,
  Button,
  Group,
  Stack,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { useState, useTransition } from "react";

import { addPart } from "@/app/actions";
import {
  MetadataFields,
  useMetadataForm,
} from "@/components/backoffice/Metadata";

// Fields mirror the API's fixed metadata schema (schema/metadata.schema.json)
export function AddPartForm() {
  const metadataForm = useMetadataForm();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (form: FormData) => {
    const text = (name: string) => String(form.get(name) ?? "").trim() || null;

    const parsed = metadataForm.toMetadata();
    if (parsed.error !== undefined) {
      setError(parsed.error);
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await addPart({
        name: String(form.get("name") ?? "").trim(),
        description: text("description"),
        metadata: parsed.metadata,
      });
      // Only reached on failure; success redirects to the new part
      setFieldErrors(result.fields ?? {});
      setError(
        result.error ??
          (result.fields?.[""] || null) ??
          (result.fields ? "Some fields need fixing" : null),
      );
    });
  };

  return (
    <Box className="panel" p="lg" maw={860}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit(new FormData(event.currentTarget));
        }}
      >
        <Stack gap="lg">
          <Stack gap="sm">
            <Title order={2}>Unit</Title>
            <TextInput
              name="name"
              label="Name"
              description="The SKU is generated when the unit is created"
              required
            />
            <Textarea
              name="description"
              label="Description"
              autosize
              minRows={2}
            />
          </Stack>

          <MetadataFields form={metadataForm} fieldErrors={fieldErrors} />

          {error && (
            <Alert color="red" variant="light">
              {error}
            </Alert>
          )}

          <Group justify="flex-end">
            <Button type="submit" loading={pending}>
              Create unit
            </Button>
          </Group>
        </Stack>
      </form>
    </Box>
  );
}
