"use client";

import {
  Alert,
  Button,
  Grid,
  GridCol,
  Group,
  NumberInput,
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

function moneyInput(value: string | number): string {
  if (value === "" || value === undefined || value === null) return "";
  return String(value);
}

// Fields mirror the API's fixed metadata schema (schema/metadata.schema.json)
export function AddPartForm() {
  const metadataForm = useMetadataForm();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [composite, setComposite] = useState<string | number>("0.00");
  const [unit, setUnit] = useState<string | number>("");
  // The success redirect is a router navigation, which this doesn't guard
  useUnsavedChanges(
    name.trim() !== "" ||
      description.trim() !== "" ||
      moneyInput(composite) !== "0.00" ||
      moneyInput(unit) !== "" ||
      metadataForm.dirty,
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
        composite_price: moneyInput(composite) || "0.00",
        unit_price: moneyInput(unit) === "" ? null : moneyInput(unit),
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
              <NumberInput
                label="Composite price"
                description="Cost of this unit on its own"
                value={composite}
                onChange={setComposite}
                decimalScale={2}
                fixedDecimalScale
                min={0}
                step={0.01}
                error={fieldErrors.composite_price}
              />
              <NumberInput
                label="Unit price"
                description="Defaults to the composite price when left blank"
                placeholder={moneyInput(composite) || "0.00"}
                value={unit}
                onChange={setUnit}
                decimalScale={2}
                fixedDecimalScale
                min={0}
                step={0.01}
                error={fieldErrors.unit_price}
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
