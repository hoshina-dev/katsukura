import { Box, Group, SimpleGrid, Skeleton, Stack, Text } from "@mantine/core";
import { useEffect, useRef, useState } from "react";

import { PageError } from "@/app/error";
import { Link, navigate, useRefreshToken } from "@/libs/nav";

import {
  CATALOG_PAGE_SIZE,
  LIST_PAGE_SIZE,
  type CatalogEntry,
  type CatalogQuery,
  type CatalogView,
  type Item,
  itemHref,
  parseCatalogQuery,
  parseCatalogView,
  type SearchParams,
  serialLabel,
  skuHref,
} from "@/libs/inventory";
import { findItemsBySerial, getCatalog } from "@/libs/katsukuraApi";

import { CatalogToolbar } from "./CatalogControls";
import { AssemblyBadge, CatalogTable } from "./CatalogTable";
import { DeletePartButton } from "./DeletePartButton";
import { PageHeader } from "./PageHeader";
import { Pager } from "./Pager";
import { PartImage } from "./PartImage";
import { StockMeter } from "./StockCounts";

const GRID_COLS = { base: 2, sm: 3, md: 4, lg: 6 };

function CatalogCard({ entry }: { entry: CatalogEntry }) {
  return (
    <Link
      href={skuHref(entry.sku)}
      className="catalog-card-link"
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <Box className="panel catalog-card" h="100%" pos="relative">
        <PartImage src={entry.imageUrl} alt={entry.name} ratio={1} />
        <Box pos="absolute" top={6} right={6}>
          <DeletePartButton
            partId={entry.id}
            name={entry.name}
            itemCount={entry.stock.total}
            onImage
          />
        </Box>
        <Stack gap={6} p="sm">
          <div>
            <Text size="sm" fw={500} truncate>
              {entry.name}
            </Text>
            <Text size="xs" c="dimmed" ff="monospace" truncate>
              {entry.sku}
            </Text>
            {entry.description && (
              <Text size="xs" c="dimmed" truncate>
                {entry.description}
              </Text>
            )}
          </div>
          <AssemblyBadge count={entry.componentCount} />
          <StockMeter stock={entry.stock} w="100%" />
          <Text size="xs" c="dimmed" className="tabular">
            {entry.stock.in_use} in use · {entry.stock.available} free
          </Text>
        </Stack>
      </Box>
    </Link>
  );
}

function NoResults({ total, search }: { total: number; search: string }) {
  return (
    <Box className="panel" p="xl">
      <Stack gap={4} align="center" py="lg">
        <Text fw={500}>
          {total > 0
            ? "This page is past the last result"
            : search
              ? `No units match “${search}”`
              : "No units yet"}
        </Text>
        <Text size="sm" c="dimmed" ta="center">
          {total > 0
            ? "Go back a page, or clear the search."
            : search
              ? "Search looks at unit names, SKUs, descriptions and item serial numbers. Try a shorter term."
              : "Create the first unit with New unit; its SKU is generated for you."}
        </Text>
      </Stack>
    </Box>
  );
}

// Items whose serial number matches the search, linked to their pages
function SerialMatches({ items, search }: { items: Item[]; search: string }) {
  if (items.length === 0) return null;
  return (
    <Box className="panel" p="md">
      <Text size="sm" fw={500} mb={6}>
        Items with serial number matching “{search}”
      </Text>
      <Stack gap={4}>
        {items.map((item) => (
          <Group key={item.id} gap="xs" wrap="nowrap">
            <Link
              href={itemHref(item.part?.sku ?? "", item.id)}
              style={{
                color: "var(--mantine-color-anchor)",
                textDecoration: "none",
              }}
            >
              <Text size="sm" ff="monospace" span>
                {serialLabel(item)}
              </Text>
            </Link>
            <Text size="sm" c="dimmed" truncate>
              {item.part?.name}
            </Text>
          </Group>
        ))}
      </Stack>
    </Box>
  );
}

function pageHref(query: CatalogQuery, view: CatalogView, page: number) {
  const params = new URLSearchParams();
  if (query.search) params.set("q", query.search);
  if (query.sort !== "default") params.set("sort", query.sort);
  if (view === "grid") params.set("view", view);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return search ? `/?${search}` : "/";
}

export function CatalogResults({
  query,
  view,
}: {
  query: CatalogQuery;
  view: CatalogView;
}) {
  const token = useRefreshToken();
  const queryKey = JSON.stringify([query, view]);
  const seen = useRef(queryKey);
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | {
        status: "ready";
        entries: CatalogEntry[];
        total: number;
        serials: Item[];
      }
  >({ status: "loading" });

  useEffect(() => {
    let cancel = false;
    if (seen.current !== queryKey) {
      seen.current = queryKey;
      setState({ status: "loading" });
    }
    // The table scrolls from the start; the grid shows one page at a time
    Promise.all([
      view === "table"
        ? getCatalog({ ...query, page: 1 }, LIST_PAGE_SIZE)
        : getCatalog(query),
      query.search ? findItemsBySerial(query.search) : Promise.resolve([]),
    ])
      .then(([{ entries, total }, serials]) => {
        if (cancel) return;
        const pageCount = Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE));
        // e.g. the last card on a later page was deleted
        if (entries.length === 0 && total > 0 && query.page > pageCount) {
          navigate(pageHref(query, view, pageCount), true);
          return;
        }
        setState({ status: "ready", entries, total, serials });
      })
      .catch((error: unknown) => {
        if (!cancel) {
          setState({
            status: "error",
            message:
              error instanceof Error ? error.message : "Could not load units",
          });
        }
      });
    return () => {
      cancel = true;
    };
  }, [queryKey, token, query, view]);

  if (state.status === "loading") return <CatalogSkeleton view={view} />;
  if (state.status === "error") return <PageError message={state.message} />;

  const { entries, total, serials } = state;
  const pageCount = Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE));
  const matches = <SerialMatches items={serials} search={query.search} />;

  if (entries.length === 0) {
    return serials.length > 0 ? (
      matches
    ) : (
      <NoResults total={total} search={query.search} />
    );
  }

  if (view === "table") {
    return (
      <Stack gap="md">
        {matches}
        <CatalogTable
          entries={entries}
          total={total}
          query={{ ...query, page: 1 }}
        />
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      {matches}
      <SimpleGrid cols={GRID_COLS} spacing="sm">
        {entries.map((entry) => (
          <CatalogCard key={entry.id} entry={entry} />
        ))}
      </SimpleGrid>
      <Pager page={query.page} pageCount={pageCount} total={total} />
    </Stack>
  );
}

export function CatalogSkeleton({ view }: { view: CatalogView }) {
  if (view === "table") {
    return (
      <Box className="panel" p="md">
        <Stack gap="md">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} height={36} />
          ))}
        </Stack>
      </Box>
    );
  }
  return (
    <SimpleGrid cols={GRID_COLS} spacing="sm">
      {Array.from({ length: CATALOG_PAGE_SIZE }, (_, i) => (
        <Box key={i} className="panel">
          <Skeleton style={{ aspectRatio: "1" }} radius={0} />
          <Box p="sm">
            <Skeleton height={14} width="70%" />
            <Skeleton height={10} mt={8} width="40%" />
          </Box>
        </Box>
      ))}
    </SimpleGrid>
  );
}

export function Catalog({ params }: { params: SearchParams }) {
  const query = parseCatalogQuery(params);
  const view = parseCatalogView(params);

  return (
    <Stack gap="md">
      <PageHeader title="Units" />
      <CatalogToolbar />
      <CatalogResults query={query} view={view} />
    </Stack>
  );
}
