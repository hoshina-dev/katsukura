import { Box, SimpleGrid, Skeleton, Stack, Text } from "@mantine/core";
import Link from "next/link";
import { Suspense } from "react";

import {
  CATALOG_PAGE_SIZE,
  LIST_PAGE_SIZE,
  type CatalogEntry,
  type CatalogQuery,
  type CatalogView,
  parseCatalogQuery,
  parseCatalogView,
  type SearchParams,
  skuHref,
} from "@/libs/inventory";
import { getCatalog } from "@/libs/katsukuraApi";

import { CatalogToolbar } from "./CatalogControls";
import { CatalogTable } from "./CatalogTable";
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
          </div>
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
              ? "Search looks at unit names and SKUs. Try a shorter term."
              : "Create the first unit with New unit; its SKU is generated for you."}
        </Text>
      </Stack>
    </Box>
  );
}

export async function CatalogResults({
  query,
  view,
}: {
  query: CatalogQuery;
  view: CatalogView;
}) {
  // The table scrolls from the start; the grid shows one page at a time
  const { entries, total } =
    view === "table"
      ? await getCatalog({ ...query, page: 1 }, LIST_PAGE_SIZE)
      : await getCatalog(query);
  const pageCount = Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE));

  if (entries.length === 0) {
    return <NoResults total={total} search={query.search} />;
  }

  if (view === "table") {
    return (
      <CatalogTable
        entries={entries}
        total={total}
        query={{ ...query, page: 1 }}
      />
    );
  }

  return (
    <Stack gap="md">
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
      <Suspense
        key={JSON.stringify([query, view])}
        fallback={<CatalogSkeleton view={view} />}
      >
        <CatalogResults query={query} view={view} />
      </Suspense>
    </Stack>
  );
}
