"use client";

import {
  Button,
  Group,
  SegmentedControl,
  Text,
  TextInput,
  VisuallyHidden,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { IconLayoutGrid, IconList, IconSearch } from "@tabler/icons-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

function useCatalogParams() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const update = useCallback(
    (changes: Record<string, string | null>, resetPage = true) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      if (resetPage) next.delete("page");
      const search = next.toString();
      router.replace(search ? `${pathname}?${search}` : pathname, {
        scroll: false,
      });
    },
    [params, pathname, router],
  );

  return { params, update };
}

export function CatalogToolbar() {
  const { params, update } = useCatalogParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [debounced] = useDebouncedValue(search, 300);
  const lastSearch = useRef(debounced);

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
    </Group>
  );
}

interface CatalogPagerProps {
  page: number;
  pageCount: number;
  total: number;
}

export function CatalogPager({ page, pageCount, total }: CatalogPagerProps) {
  const { update } = useCatalogParams();
  const goTo = (next: number) =>
    update({ page: next > 1 ? String(next) : null }, false);

  return (
    <Group justify="space-between">
      <Text size="sm" c="dimmed">
        Page {page} of {pageCount} · {total}{" "}
        {total === 1 ? "result" : "results"}
      </Text>
      <Group gap="xs">
        <Button
          variant="default"
          size="sm"
          disabled={page <= 1}
          onClick={() => goTo(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="default"
          size="sm"
          disabled={page >= pageCount}
          onClick={() => goTo(page + 1)}
        >
          Next
        </Button>
      </Group>
    </Group>
  );
}
