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
  const urlQuery = (params.get("q") ?? "").trim();
  const [search, setSearch] = useState(urlQuery);
  const [debounced] = useDebouncedValue(search, 300);
  // The query in the address as of the toolbar's last write or adoption
  const written = useRef(urlQuery);
  const lastDebounced = useRef(debounced);
  // One history entry per search: the first write pushes, later keystrokes
  // replace it until the box loses focus
  const pushed = useRef(false);

  // A link or Back changed the query: show it in the box
  useEffect(() => {
    if (urlQuery === written.current) return;
    written.current = urlQuery;
    pushed.current = false;
    setSearch(urlQuery);
  }, [urlQuery]);

  useEffect(() => {
    // update changes with every navigation; only new typing writes
    if (debounced === lastDebounced.current) return;
    lastDebounced.current = debounced;
    const query = debounced.trim();
    if (query === written.current) return;
    written.current = query;
    update({ q: query || null }, true, !pushed.current);
    pushed.current = true;
  }, [debounced, update]);

  return (
    <Group gap="sm" wrap="wrap">
      <TextInput
        aria-label="Search by name, SKU, description or serial number"
        placeholder="Search name, SKU, description or serial"
        leftSection={<IconSearch size={16} />}
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
        onBlur={() => {
          pushed.current = false;
        }}
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
        href="/units/new"
        leftSection={<IconPlus size={16} />}
      >
        New unit
      </Button>
    </Group>
  );
}
