import { useEffect, useState } from "react";
import { Button, Group, Select, Stack, Text } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { api, type List, type Part, type Item, itemLabel, query } from "./api";
import { ErrorMessage, useResource } from "./ui";
export function RecordPicker({
  kind,
  value,
  onChange,
  partID,
  exclude,
  disabled,
  label,
  required = true,
}: {
  kind: "parts" | "inventory";
  value: string;
  onChange: (value: string) => void;
  partID?: string;
  exclude?: string;
  disabled?: boolean;
  label: string;
  required?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [typedSearch, setTypedSearch] = useState("");
  const [debounced] = useDebouncedValue(typedSearch, 200);
  const [page, setPage] = useState(0);
  const resource = useResource<List<Part | Item>>(
    "/" +
      kind +
      query({
        search: debounced,
        part_id: partID,
        limit: 50,
        offset: page * 50,
      }),
  );
  const [selected, setSelected] = useState<{ value: string; label: string }>();
  useEffect(() => {
    let current = true;
    if (!value) {
      setSelected(undefined);
      return;
    }
    setSelected(previous => previous?.value === value ? previous : {value, label: value.slice(0,8)});
    api<Part | Item>(`/${kind}/${value}`)
      .then((row) => {
        if (current)
          setSelected({
            value: row.id,
            label:
              "sku" in row
                ? `${row.sku} · ${row.name}`
                : `${itemLabel(row)} · ${row.location || "No location"}`,
          });
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [kind, value]);
  const options = (resource.data?.data || [])
    .filter((row) => row.id !== exclude)
    .map((row) => ({
      value: row.id,
      label:
        "sku" in row
          ? `${row.sku} · ${row.name}`
          : `${itemLabel(row)} · ${row.location || "No location"}`,
    }));
  if (selected && !options.some((o) => o.value === selected.value))
    options.unshift(selected);
  return (
    <Stack gap={5}>
      <Select
        required={required}
        label={label}
        placeholder={resource.loading ? "Loading…" : "Search and select"}
        searchable
        filter={({ options }) => options}
        disabled={disabled}
        searchValue={search}
        onSearchChange={setSearch}
        onInput={(event) => {
          const next = event.currentTarget.value;
          if (next !== typedSearch) setPage(0);
          setTypedSearch(next);
        }}
        value={value || null}
        data={options}
        onChange={(next) => {
          setTypedSearch("");
          onChange(next || "");
          setSelected(options.find((option) => option.value === next));
        }}
        nothingFoundMessage="No matching records"
      />
      <ErrorMessage message={resource.error} />
      {(resource.data?.total || 0) > 50 && (
        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            Page {page + 1} of {Math.ceil((resource.data?.total || 0) / 50)}
          </Text>
          <Group gap={5}>
            <Button
              size="compact-xs"
              variant="subtle"
              disabled={!page}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              size="compact-xs"
              variant="subtle"
              disabled={(page + 1) * 50 >= (resource.data?.total || 0)}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </Group>
        </Group>
      )}
    </Stack>
  );
}
