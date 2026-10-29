"use client";

import {
  ActionIcon,
  Alert,
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
import { type ReactNode, useRef, useState, useTransition } from "react";

import { addPart } from "@/app/actions";
import { ImageUploader } from "@/components/backoffice/ImageUploader";
import { countryOptionsFilter, countrySelectData } from "@/libs/countries";

type SpecRow = { id: number; key: string; value: string };

function FormGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Stack gap="sm">
      <Title order={2}>{title}</Title>
      {children}
    </Stack>
  );
}

// Fields mirror the API's fixed metadata schema (schema/metadata.schema.json)
export function AddPartForm() {
  const nextId = useRef(1);
  const [images, setImages] = useState<string[]>([]);
  const [category, setCategory] = useState<string[]>([]);
  const [country, setCountry] = useState<string | null>(null);
  const [temperature, setTemperature] = useState<string | number>("");
  const [spec, setSpec] = useState<SpecRow[]>([{ id: 0, key: "", value: "" }]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const updateSpec = (id: number, change: Partial<SpecRow>) =>
    setSpec((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...change } : row)),
    );

  const submit = (form: FormData) => {
    const text = (name: string) =>
      String(form.get(name) ?? "").trim() || null;

    const specification: Record<string, string> = {};
    for (const row of spec) {
      const key = row.key.trim();
      if (!key) continue;
      if (key in specification) {
        setError(`Specification "${key}" is listed twice`);
        return;
      }
      specification[key] = row.value.trim();
    }

    setError(null);
    startTransition(async () => {
      const result = await addPart({
        name: String(form.get("name") ?? "").trim(),
        description: text("description"),
        metadata: {
          category: category.length > 0 ? category : null,
          manufacturer: text("manufacturer"),
          country_of_origin: country,
          notes: text("notes"),
          temperature_stage: temperature === "" ? null : Number(temperature),
          image_urls: images.length > 0 ? images : null,
          specification,
        },
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
          <FormGroup title="Unit">
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
          </FormGroup>

          <Divider color="var(--app-line)" />

          <FormGroup title="Images">
            <ImageUploader value={images} onChange={setImages} />
            {fieldErrors.image_urls && (
              <Text size="xs" c="red.8">
                {fieldErrors.image_urls}
              </Text>
            )}
          </FormGroup>

          <Divider color="var(--app-line)" />

          <FormGroup title="Classification">
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <TextInput
                name="manufacturer"
                label="Manufacturer"
                error={fieldErrors.manufacturer}
              />
              <Select
                label="Country of origin"
                placeholder="Search for a country"
                data={countrySelectData}
                value={country}
                onChange={setCountry}
                filter={countryOptionsFilter}
                searchable
                clearable
                error={fieldErrors.country_of_origin}
              />
              <TagsInput
                label="Categories"
                placeholder="Type and press Enter"
                value={category}
                onChange={setCategory}
                error={fieldErrors.category}
              />
              <NumberInput
                label="Temperature stage"
                value={temperature}
                onChange={setTemperature}
                error={fieldErrors.temperature_stage}
              />
            </SimpleGrid>
            <Textarea
              name="notes"
              label="Notes"
              autosize
              minRows={2}
              error={fieldErrors.notes}
            />
          </FormGroup>

          <Divider color="var(--app-line)" />

          <FormGroup title="Specification">
            <Text size="xs" c="dimmed" mt={-6}>
              Spec sheet rows, such as Material: Oak or Weight: 2.4 kg. Rows
              without a name are skipped.
            </Text>
            {spec.map((row) => (
              <Group key={row.id} gap="xs" wrap="nowrap">
                <TextInput
                  aria-label="Specification name"
                  placeholder="Name"
                  value={row.key}
                  onChange={(event) =>
                    updateSpec(row.id, { key: event.currentTarget.value })
                  }
                  style={{ flex: 1 }}
                />
                <TextInput
                  aria-label="Specification value"
                  placeholder="Value"
                  value={row.value}
                  onChange={(event) =>
                    updateSpec(row.id, { value: event.currentTarget.value })
                  }
                  style={{ flex: 2 }}
                />
                <ActionIcon
                  className="row-delete"
                  variant="subtle"
                  color="gray"
                  size="lg"
                  aria-label="Remove row"
                  onClick={() =>
                    setSpec((rows) => {
                      const rest = rows.filter((other) => other.id !== row.id);
                      return rest.length > 0
                        ? rest
                        : [{ id: nextId.current++, key: "", value: "" }];
                    })
                  }
                >
                  <IconTrash size={16} stroke={1.5} />
                </ActionIcon>
              </Group>
            ))}
            {fieldErrors.specification && (
              <Text size="xs" c="red.8">
                {fieldErrors.specification}
              </Text>
            )}
            <Group>
              <Button
                variant="subtle"
                size="xs"
                leftSection={<IconPlus size={14} />}
                onClick={() =>
                  setSpec((rows) => [
                    ...rows,
                    { id: nextId.current++, key: "", value: "" },
                  ])
                }
              >
                Add row
              </Button>
            </Group>
          </FormGroup>

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
