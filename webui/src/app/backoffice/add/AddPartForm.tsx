"use client";

import {
  ActionIcon,
  Alert,
  Autocomplete,
  Button,
  Card,
  Code,
  Group,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { useRef, useState, useTransition } from "react";

import { type Metadata, METADATA_KEYS } from "@/libs/inventory";

import { addPart, checkMetadata, type SubmitResult } from "./actions";

type Row = { id: number; key: string; value: string };

export function AddPartForm({ sku }: { sku: string }) {
  const nextId = useRef(1);
  const [rows, setRows] = useState<Row[]>([{ id: 0, key: "", value: "" }]);
  const [focusId, setFocusId] = useState<number | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Metadata | null>(null);
  const [pending, startTransition] = useTransition();

  const newRow = () => ({ id: nextId.current++, key: "", value: "" });

  const updateRow = (id: number, change: Partial<Row>) => {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...change } : row)),
    );
    setRowErrors(({ [id]: _, ...rest }) => rest);
    setChecked(null);
  };

  const addRow = () => {
    const row = newRow();
    setRows((current) => [...current, row]);
    setFocusId(row.id);
  };

  const removeRow = (id: number) => {
    setRows((current) => {
      const rest = current.filter((row) => row.id !== id);
      return rest.length > 0 ? rest : [newRow()];
    });
    setRowErrors(({ [id]: _, ...rest }) => rest);
    setChecked(null);
  };

  // Rows with a blank key are skipped; values are parsed as JSON
  const buildMetadata = () => {
    const metadata: Record<string, unknown> = {};
    const errors: Record<number, string> = {};
    for (const row of rows) {
      const key = row.key.trim();
      if (!key) continue;
      if (key in metadata) {
        errors[row.id] = "duplicate key";
        continue;
      }
      try {
        metadata[key] = JSON.parse(row.value);
      } catch {
        errors[row.id] = row.value.trim()
          ? 'invalid JSON (wrap text in "")'
          : "value is required";
      }
    }
    return { metadata, errors };
  };

  const submit = (
    action: (metadata: Record<string, unknown>) => Promise<SubmitResult>,
  ) => {
    const { metadata, errors } = buildMetadata();
    setError(null);
    setChecked(null);
    setRowErrors(errors);
    if (Object.keys(errors).length > 0) return;

    startTransition(async () => {
      const result = await action(metadata);
      const fields = result.fields ?? {};
      const byRow: Record<number, string> = {};
      for (const row of rows) {
        const reason = fields[row.key.trim()];
        if (row.key.trim() && reason) byRow[row.id] = reason;
      }
      setRowErrors(byRow);
      setError(result.error ?? fields[""] ?? null);
      setChecked(result.metadata ?? null);
    });
  };

  return (
    <Card withBorder radius="md" padding="lg" maw={760}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          submit((metadata) =>
            addPart({
              sku,
              name: String(form.get("name") ?? ""),
              description: String(form.get("description") ?? "").trim() || null,
              metadata,
            }),
          );
        }}
      >
        <Stack gap="md">
          {error && (
            <Alert color="red" variant="light">
              {error}
            </Alert>
          )}
          <TextInput label="SKU" value={sku} disabled />
          <TextInput name="name" label="Name" required />
          <Textarea name="description" label="Description" autosize />

          <Stack gap="xs">
            <Text size="sm" fw={500}>
              Metadata
            </Text>
            {rows.map((row) => (
              <div key={row.id}>
                <Group gap="xs" wrap="nowrap" align="flex-start">
                  <Autocomplete
                    aria-label="Key"
                    placeholder="Key"
                    value={row.key}
                    autoFocus={row.id === focusId}
                    onChange={(key) => updateRow(row.id, { key })}
                    data={METADATA_KEYS.filter(
                      (key) =>
                        !rows.some(
                          (other) =>
                            other.id !== row.id && other.key.trim() === key,
                        ),
                    )}
                    style={{ flex: 1 }}
                  />
                  <TextInput
                    aria-label="Value"
                    placeholder='"text", 42, ["a", "b"] or null'
                    ff="monospace"
                    value={row.value}
                    onChange={(event) =>
                      updateRow(row.id, { value: event.currentTarget.value })
                    }
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      if (row.value.trim()) addRow();
                    }}
                    style={{ flex: 2 }}
                  />
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="lg"
                    aria-label="Delete row"
                    onClick={() => removeRow(row.id)}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
                {rowErrors[row.id] && (
                  <Text size="xs" c="red" mt={4}>
                    *{rowErrors[row.id]}
                  </Text>
                )}
              </div>
            ))}
          </Stack>

          {checked && (
            <Stack gap={4}>
              <Text size="sm" c="green.7" fw={500}>
                Metadata is valid
              </Text>
              <Code block>{JSON.stringify(checked, null, 2)}</Code>
            </Stack>
          )}

          <Group justify="flex-end">
            <Button
              variant="default"
              loading={pending}
              onClick={() => submit(checkMetadata)}
            >
              Check
            </Button>
            <Button type="submit" loading={pending}>
              Add part
            </Button>
          </Group>
        </Stack>
      </form>
    </Card>
  );
}
