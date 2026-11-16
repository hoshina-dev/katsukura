"use client";

import {
  Alert,
  Button,
  Grid,
  GridCol,
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
  MetadataImages,
  useMetadataForm,
} from "@/components/backoffice/Metadata";
import { Section } from "@/components/backoffice/Section";
import { useUnsavedChanges } from "@/components/backoffice/useUnsavedChanges";

// Fields mirror the API's fixed metadata schema (schema/metadata.schema.json)
export function AddPartForm() {
  const metadataForm = useMetadataForm();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  // The success redirect is a router navigation, which this doesn't guard
  useUnsavedChanges(
    name.trim() !== "" || description.trim() !== "" || metadataForm.dirty,
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    const parsed = metadataForm.toMetadata();
    if (parsed.error !== undefined) {
      setError(parsed.error);
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await addPart({
        name: name.trim(),
        description: description.trim() || null,
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
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Grid gutter="md">
        <GridCol span={{ base: 12, lg: 8 }}>
          <Stack gap="lg" className="panel" p="lg">
            <Stack gap="sm">
              <Title order={2}>Unit</Title>
              <TextInput
                label="Name"
                description="The SKU is generated when the unit is created"
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                required
              />
              <Textarea
                label="Description"
                value={description}
                onChange={(event) => setDescription(event.currentTarget.value)}
                autosize
                minRows={2}
              />
            </Stack>

            <MetadataFields
              form={metadataForm}
              fieldErrors={fieldErrors}
              hideImages
            />

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
        </GridCol>
        <GridCol span={{ base: 12, lg: 4 }} order={{ base: -1, lg: 0 }}>
          <Section title="Images">
            <MetadataImages
              form={metadataForm}
              error={fieldErrors.image_urls}
            />
          </Section>
        </GridCol>
      </Grid>
    </form>
  );
}
