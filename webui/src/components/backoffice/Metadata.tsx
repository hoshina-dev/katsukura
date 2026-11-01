"use client";

import {
  ActionIcon,
  Button,
  Divider,
  Group,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  TagsInput,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { Fragment, type ReactNode, useRef, useState } from "react";

import type { SubmitResult } from "@/app/actions";
import { countryOptionsFilter, countrySelectData } from "@/libs/countries";
import { imageUrls, type Metadata } from "@/libs/inventory";

import { ImageUploader } from "./ImageUploader";

// One line per problem, e.g. "category: got string, want null or array"
export function errorLines(result: SubmitResult) {
  const lines = Object.entries(result.fields ?? {}).map(([key, reason]) =>
    key ? `${key}: ${reason}` : reason,
  );
  return result.error ? [result.error, ...lines] : lines;
}

type SpecRow = { id: number; key: string; value: string };

function str(value: unknown) {
  return typeof value === "string" ? value : "";
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];
}

// Form state for the API's fixed metadata schema (schema/metadata.schema.json)
export function useMetadataForm(initial: Metadata = {}, onChange?: () => void) {
  const spec = Object.entries(
    (initial.specification ?? {}) as Record<string, unknown>,
  ).map(([key, value], id) => ({ id, key, value: String(value ?? "") }));
  const nextId = useRef(spec.length + 1);
  const [images, setImages] = useState(imageUrls(initial));
  const [category, setCategory] = useState(strings(initial.category));
  const [manufacturer, setManufacturer] = useState(str(initial.manufacturer));
  const [country, setCountry] = useState<string | null>(
    str(initial.country_of_origin) || null,
  );
  const [notes, setNotes] = useState(str(initial.notes));
  const [temperature, setTemperature] = useState<string | number>(
    typeof initial.temperature_stage === "number"
      ? initial.temperature_stage
      : "",
  );
  const [specRows, setSpecRows] = useState<SpecRow[]>(
    spec.length > 0 ? spec : [{ id: 0, key: "", value: "" }],
  );
  const touch =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      onChange?.();
    };

  const emptyRow = () => ({ id: nextId.current++, key: "", value: "" });

  const toMetadata = ():
    | { metadata: Record<string, unknown>; error?: never }
    | { error: string } => {
    const specification: Record<string, string> = {};
    for (const row of specRows) {
      const key = row.key.trim();
      if (!key) continue;
      if (key in specification) {
        return { error: `Specification "${key}" is listed twice` };
      }
      specification[key] = row.value.trim();
    }
    return {
      metadata: {
        category: category.length > 0 ? category : null,
        manufacturer: manufacturer.trim() || null,
        country_of_origin: country,
        notes: notes.trim() || null,
        temperature_stage: temperature === "" ? null : Number(temperature),
        image_urls: images.length > 0 ? images : null,
        specification,
      },
    };
  };

  return {
    images,
    setImages: touch(setImages),
    category,
    setCategory: touch(setCategory),
    manufacturer,
    setManufacturer: touch(setManufacturer),
    country,
    setCountry: touch(setCountry),
    notes,
    setNotes: touch(setNotes),
    temperature,
    setTemperature: touch(setTemperature),
    specRows,
    updateSpec: (id: number, change: Partial<SpecRow>) =>
      touch(setSpecRows)(
        specRows.map((row) => (row.id === id ? { ...row, ...change } : row)),
      ),
    removeSpec: (id: number) => {
      const rest = specRows.filter((row) => row.id !== id);
      touch(setSpecRows)(rest.length > 0 ? rest : [emptyRow()]);
    },
    addSpec: () => setSpecRows((rows) => [...rows, emptyRow()]),
    toMetadata,
  };
}

export type MetadataForm = ReturnType<typeof useMetadataForm>;

function FieldError({ children }: { children?: string }) {
  return children ? (
    <Text size="xs" c="red.8">
      {children}
    </Text>
  ) : null;
}

// Images, classification and specification groups; `compact` fits a sidebar
export function MetadataFields({
  form,
  fieldErrors,
  compact,
}: {
  form: MetadataForm;
  fieldErrors: Record<string, string>;
  compact?: boolean;
}) {
  const groups: { title: string; body: ReactNode }[] = [
    {
      title: "Images",
      body: (
        <>
          <ImageUploader
            value={form.images}
            onChange={(update) => form.setImages(update(form.images))}
          />
          <FieldError>{fieldErrors.image_urls}</FieldError>
        </>
      ),
    },
    {
      title: "Classification",
      body: (
        <>
          <SimpleGrid cols={compact ? 1 : { base: 1, sm: 2 }} spacing="md">
            <TextInput
              label="Manufacturer"
              value={form.manufacturer}
              onChange={(event) =>
                form.setManufacturer(event.currentTarget.value)
              }
              error={fieldErrors.manufacturer}
            />
            <Select
              label="Country of origin"
              placeholder="Search for a country"
              data={countrySelectData}
              value={form.country}
              onChange={form.setCountry}
              filter={countryOptionsFilter}
              searchable
              clearable
              error={fieldErrors.country_of_origin}
            />
            <TagsInput
              label="Categories"
              placeholder="Type and press Enter"
              value={form.category}
              onChange={form.setCategory}
              error={fieldErrors.category}
            />
            <NumberInput
              label="Temperature stage"
              value={form.temperature}
              onChange={form.setTemperature}
              error={fieldErrors.temperature_stage}
            />
          </SimpleGrid>
          <Textarea
            label="Notes"
            value={form.notes}
            onChange={(event) => form.setNotes(event.currentTarget.value)}
            autosize
            minRows={2}
            error={fieldErrors.notes}
          />
        </>
      ),
    },
    {
      title: "Specification",
      body: (
        <>
          <Text size="xs" c="dimmed" mt={-6}>
            Spec sheet rows, such as Material: Oak or Weight: 2.4 kg. Rows
            without a name are skipped.
          </Text>
          {form.specRows.map((row) => (
            <Group key={row.id} gap="xs" wrap="nowrap">
              <TextInput
                aria-label="Specification name"
                placeholder="Name"
                value={row.key}
                onChange={(event) =>
                  form.updateSpec(row.id, { key: event.currentTarget.value })
                }
                style={{ flex: 1 }}
              />
              <TextInput
                aria-label="Specification value"
                placeholder="Value"
                value={row.value}
                onChange={(event) =>
                  form.updateSpec(row.id, { value: event.currentTarget.value })
                }
                style={{ flex: compact ? 1 : 2 }}
              />
              <ActionIcon
                className="row-delete"
                variant="subtle"
                color="gray"
                size="lg"
                aria-label="Remove row"
                onClick={() => form.removeSpec(row.id)}
              >
                <IconTrash size={16} stroke={1.5} />
              </ActionIcon>
            </Group>
          ))}
          <FieldError>{fieldErrors.specification}</FieldError>
          <Group>
            <Button
              variant="subtle"
              size="xs"
              leftSection={<IconPlus size={14} />}
              onClick={form.addSpec}
            >
              Add row
            </Button>
          </Group>
        </>
      ),
    },
  ];

  return groups.map(({ title, body }) => (
    <Fragment key={title}>
      <Divider color="var(--app-line)" />
      <Stack gap="sm">
        <Title order={compact ? 3 : 2}>{title}</Title>
        {body}
      </Stack>
    </Fragment>
  ));
}
