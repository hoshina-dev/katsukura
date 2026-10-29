"use client";

import {
  Button,
  Group,
  SegmentedControl,
  Select,
  TextInput,
  VisuallyHidden,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import {
  IconLayoutGrid,
  IconList,
  IconPlus,
  IconSearch,
} from "@tabler/icons-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useSearchParamUpdate } from "./Pager";

const SORTS = [
  { value: "default", label: "Newest first" },
  { value: "name", label: "Name, A–Z" },
  { value: "amount", label: "Most stock" },
];

export function CatalogToolbar() {
  const { params, update } = useSearchParamUpdate();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [debounced] = useDebouncedValue(search, 300);
  const lastSearch = useRef(debounced);

  useEffect(() => {
    if (lastSearch.current === debounced) return;
    lastSearch.current = debounced;
    update({ q: debounced.trim() || null });
  }, [debounced, update]);

  return (
    <Group gap="sm" wrap="wrap">
      <TextInput
        aria-label="Search by name or SKU"
        placeholder="Search name or SKU"
        leftSection={<IconSearch size={16} />}
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
        style={{ flex: "1 1 240px" }}
      />
      <Select
        aria-label="Sort"
        data={SORTS}
        value={params.get("sort") ?? "default"}
        onChange={(value) =>
          update({ sort: !value || value === "default" ? null : value })
        }
        allowDeselect={false}
        w={170}
      />
      <SegmentedControl
        aria-label="View"
        value={params.get("view") ?? "table"}
        onChange={(value) =>
          update({ view: value === "table" ? null : value }, false)
        }
        data={[
          {
            value: "table",
            label: (
              <>
                <IconList size={16} style={{ display: "block" }} />
                <VisuallyHidden>Table</VisuallyHidden>
              </>
            ),
          },
          {
            value: "grid",
            label: (
              <>
                <IconLayoutGrid size={16} style={{ display: "block" }} />
                <VisuallyHidden>Grid</VisuallyHidden>
              </>
            ),
          },
        ]}
      />
      <Button
        component={Link}
        href="/parts/new"
        leftSection={<IconPlus size={16} />}
      >
        New part
      </Button>
    </Group>
  );
}
