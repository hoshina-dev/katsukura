"use client";

import {
  Box,
  Button,
  Group,
  Menu,
  SegmentedControl,
  TextInput,
  VisuallyHidden,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import {
  IconArrowsSort,
  IconCheck,
  IconLayoutGrid,
  IconList,
  IconPlus,
  IconSearch,
} from "@tabler/icons-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useSearchParamUpdate } from "./Pager";

const SORTS = [
  { value: "default", label: "Default" },
  { value: "name", label: "Name (A–Z)" },
  { value: "amount", label: "Amount (most first)" },
];

export function CatalogToolbar({ addHref }: { addHref?: string }) {
  const { params, update } = useSearchParamUpdate();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [debounced] = useDebouncedValue(search, 300);
  const lastSearch = useRef(debounced);
  const sort = params.get("sort") ?? "default";

  useEffect(() => {
    if (lastSearch.current === debounced) return;
    lastSearch.current = debounced;
    update({ q: debounced.trim() || null });
  }, [debounced, update]);

  return (
    <Group gap="sm" wrap="wrap" align="center">
      <TextInput
        aria-label="Search by name or SKU"
        placeholder="Search by name or SKU..."
        leftSection={<IconSearch size={16} />}
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
        style={{ flex: "1 1 240px" }}
      />
      <SegmentedControl
        aria-label="Type"
        value={params.get("type") ?? "all"}
        onChange={(value) => update({ type: value === "all" ? null : value })}
        data={[
          { value: "all", label: "All" },
          { value: "products", label: "Products" },
          { value: "parts", label: "Parts" },
        ]}
      />
      <SegmentedControl
        aria-label="Availability"
        value={params.get("stock") ?? "all"}
        onChange={(value) => update({ stock: value === "all" ? null : value })}
        data={[
          { value: "all", label: "All" },
          { value: "in", label: "In stock" },
        ]}
      />
      <SegmentedControl
        aria-label="View"
        value={params.get("view") ?? "grid"}
        onChange={(value) =>
          update({ view: value === "grid" ? null : value }, false)
        }
        data={[
          {
            value: "grid",
            label: (
              <>
                <IconLayoutGrid size={16} style={{ display: "block" }} />
                <VisuallyHidden>Grid</VisuallyHidden>
              </>
            ),
          },
          {
            value: "table",
            label: (
              <>
                <IconList size={16} style={{ display: "block" }} />
                <VisuallyHidden>Table</VisuallyHidden>
              </>
            ),
          },
        ]}
      />
      <Menu position="bottom-end" withinPortal>
        <Menu.Target>
          <Button variant="default" leftSection={<IconArrowsSort size={16} />}>
            {sort === "default"
              ? "Sort"
              : SORTS.find((option) => option.value === sort)?.label}
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          {SORTS.map((option) => (
            <Menu.Item
              key={option.value}
              leftSection={
                option.value === sort ? <IconCheck size={14} /> : <Box w={14} />
              }
              onClick={() =>
                update({
                  sort: option.value === "default" ? null : option.value,
                })
              }
            >
              {option.label}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
      {addHref && (
        <Button
          component={Link}
          href={addHref}
          leftSection={<IconPlus size={16} />}
        >
          Add
        </Button>
      )}
    </Group>
  );
}
