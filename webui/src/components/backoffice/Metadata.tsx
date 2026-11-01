"use client";

import {
  ActionIcon,
  Box,
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

type MetadataKey =
  | "category"
  | "manufacturer"
  | "country_of_origin"
  | "notes"
  | "temperature_stage"
  | "image_urls"
  | "specification";

// Per-key JSON of what would be saved, for spotting unsaved fields
function snapshot(metadata: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(metadata).map(([k, v]) => [k, JSON.stringify(v)]),
  ) as Record<MetadataKey, string>;
}

// Form state for the API's fixed metadata schema (schema/metadata.schema.json)
export function useMetadataForm(initial: Metadata = {}) {
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
  const emptyRow = () => ({ id: nextId.current++, key: "", value: "" });

  const specification: Record<string, string> = {};
  let repeatedSpec: string | null = null;
  for (const row of specRows) {
    const key = row.key.trim();
    if (!key) continue;
    if (key in specification) repeatedSpec ??= key;
    specification[key] = row.value.trim();
  }
  const metadata = {
    category: category.length > 0 ? category : null,
    manufacturer: manufacturer.trim() || null,
    country_of_origin: country,
    notes: notes.trim() || null,
    temperature_stage: temperature === "" ? null : Number(temperature),
    image_urls: images.length > 0 ? images : null,
    specification,
  };
  const current = snapshot(metadata);
  // Lazy so the baseline is the first render's values, not every render's
  const [saved, setSaved] = useState(() => current);
  const changed = Object.fromEntries(
    Object.entries(current).map(([k, v]) => [k, saved[k as MetadataKey] !== v]),
  ) as Record<MetadataKey, boolean>;

  const toMetadata = ():
    { metadata: Record<string, unknown>; error?: never } | { error: string } =>
    repeatedSpec
      ? { error: `Specification "${repeatedSpec}" is listed twice` }
      : { metadata };

  return {
    images,
    setImages,
    category,
    setCategory,
    manufacturer,
    setManufacturer,
    country,
    setCountry,
    notes,
    setNotes,
    temperature,
    setTemperature,
    specRows,
    updateSpec: (id: number, change: Partial<SpecRow>) =>
      setSpecRows((rows) =>
        rows.map((row) => (row.id === id ? { ...row, ...change } : row)),
      ),
    removeSpec: (id: number) =>
      setSpecRows((rows) => {
        const rest = rows.filter((row) => row.id !== id);
        return rest.length > 0 ? rest : [emptyRow()];
      }),
    addSpec: () => setSpecRows((rows) => [...rows, emptyRow()]),
    toMetadata,
    changed,
    dirty: Object.values(changed).some(Boolean),
    // Call after a successful save: the current values become the baseline
    commit: () => setSaved(current),
  };
}

export type MetadataForm = ReturnType<typeof useMetadataForm>;

// Label with an orange dot while the field differs from what is saved
export function ChangedLabel({
  children,
  changed,
}: {
  children: ReactNode;
  changed?: boolean;
}) {
  return (
    <Group component="span" gap={6} wrap="nowrap" display="inline-flex">
      {children}
      {changed && (
        <Box
          component="span"
          w={7}
          h={7}
          bg="orange.6"
          title="Unsaved change"
          aria-label="Unsaved change"
          style={{ borderRadius: "50%", flexShrink: 0 }}
        />
      )}
    </Group>
  );
}

function FieldError({ children }: { children?: string }) {
  return children ? (
    <Text size="xs" c="red.8">
      {children}
    </Text>
  ) : null;
}

export function MetadataImages({
  form,
  error,
}: {
  form: MetadataForm;
  error?: string;
}) {
  return (
    <>
      <ImageUploader
        value={form.images}
        onChange={(update) => form.setImages(update(form.images))}
      />
      <FieldError>{error}</FieldError>
    </>
  );
}

// Images, classification and specification groups; `compact` fits a sidebar,
// `hideImages` is for forms that place MetadataImages elsewhere, and
// `trackChanges` marks fields that differ from the saved values
export function MetadataFields({
  form,
  fieldErrors,
  compact,
  hideImages,
  trackChanges,
}: {
  form: MetadataForm;
  fieldErrors: Record<string, string>;
  compact?: boolean;
  hideImages?: boolean;
  trackChanges?: boolean;
}) {
  const label = (text: string, key: MetadataKey) => (
    <ChangedLabel changed={trackChanges && form.changed[key]}>
      {text}
    </ChangedLabel>
  );
  const groups: { title: string; key?: MetadataKey; body: ReactNode }[] = [
    {
      title: "Images",
      key: "image_urls",
      body: <MetadataImages form={form} error={fieldErrors.image_urls} />,
    },
    {
      title: "Classification",
      body: (
        <>
          <SimpleGrid cols={compact ? 1 : { base: 1, sm: 2 }} spacing="md">
            <TextInput
              label={label("Manufacturer", "manufacturer")}
              value={form.manufacturer}
              onChange={(event) =>
                form.setManufacturer(event.currentTarget.value)
              }
              error={fieldErrors.manufacturer}
            />
            <Select
              label={label("Country of origin", "country_of_origin")}
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
              label={label("Categories", "category")}
              placeholder="Type and press Enter"
              value={form.category}
              onChange={form.setCategory}
              error={fieldErrors.category}
            />
            <NumberInput
              label={label("Temperature stage", "temperature_stage")}
              value={form.temperature}
              onChange={form.setTemperature}
              error={fieldErrors.temperature_stage}
            />
          </SimpleGrid>
          <Textarea
            label={label("Notes", "notes")}
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
      key: "specification",
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

  const shown = hideImages
    ? groups.filter((g) => g.title !== "Images")
    : groups;
  return shown.map(({ title, key, body }) => (
    <Fragment key={title}>
      <Divider color="var(--app-line)" />
      <Stack gap="sm">
        <Title order={compact ? 3 : 2}>{key ? label(title, key) : title}</Title>
        {body}
      </Stack>
    </Fragment>
  ));
}
