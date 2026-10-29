import {
  Box,
  Card,
  CardSection,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  Title,
} from "@mantine/core";
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
import { getCatalog } from "@/libs/papiRest";

import { CatalogToolbar } from "./CatalogControls";
import { DeletePartButton } from "./DeletePartButton";
import { Pager } from "./Pager";
import { CatalogTable } from "./CatalogTable";
import { PartImage } from "./PartImage";

const GRID_COLS = { base: 1, sm: 2, md: 3 };

function CatalogCard({ entry, base }: { entry: CatalogEntry; base: string }) {
  return (
    <Link
      href={skuHref(entry.sku, base)}
      className="catalog-card-link"
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <Card
        withBorder
        radius="md"
        padding="md"
        h="100%"
        className="catalog-card"
        pos="relative"
      >
        <CardSection>
          <PartImage src={entry.imageUrl} alt={entry.name} />
        </CardSection>
        {base === "/backoffice" && (
          <Box pos="absolute" top={8} right={8}>
            <DeletePartButton
              partId={entry.id}
              name={entry.name}
              itemCount={entry.stock.total}
            />
          </Box>
        )}
        <Stack gap={4} mt="md">
          <Text fw={600} truncate>
            {entry.name}
          </Text>
          <Text size="sm" c="dimmed" ff="monospace">
            {entry.sku}
          </Text>
          <Text size="sm" c="dimmed" mt="xs">
            Total{" "}
            <Text span fw={600} c="var(--mantine-color-text)">
              {entry.stock.total}
            </Text>
          </Text>
        </Stack>
      </Card>
    </Link>
  );
}

export async function CatalogResults({
  query,
  view,
  base,
}: {
  query: CatalogQuery;
  view: CatalogView;
  base: string;
}) {
  // The list view scrolls from the start; the grid shows one page at a time
  const { entries, total } =
    view === "table"
      ? await getCatalog({ ...query, page: 1 }, LIST_PAGE_SIZE)
      : await getCatalog(query);
  const pageCount = Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE));

  if (entries.length === 0) {
    return (
      <Card withBorder radius="md" padding="xl">
        <Stack gap={4} align="center" py="xl">
          <Text fw={600}>No results found</Text>
          <Text size="sm" c="dimmed" ta="center">
            {total > 0
              ? "This page is empty. Go back to the previous page."
              : "Try a different name or SKU."}
          </Text>
        </Stack>
      </Card>
    );
  }

  if (view === "table") {
    return (
      <CatalogTable
        entries={entries}
        total={total}
        query={{ ...query, page: 1 }}
        base={base}
      />
    );
  }

  return (
    <Stack gap="lg">
      <SimpleGrid cols={GRID_COLS} spacing="lg">
        {entries.map((entry) => (
          <CatalogCard key={entry.id} entry={entry} base={base} />
        ))}
      </SimpleGrid>
      <Pager page={query.page} pageCount={pageCount} total={total} />
    </Stack>
  );
}

export function CatalogSkeleton({ view }: { view: CatalogView }) {
  if (view === "table") {
    return (
      <Stack gap="xs">
        {Array.from({ length: CATALOG_PAGE_SIZE }, (_, i) => (
          <Skeleton key={i} height={64} radius="sm" />
        ))}
      </Stack>
    );
  }
  return (
    <SimpleGrid cols={GRID_COLS} spacing="lg">
      {Array.from({ length: CATALOG_PAGE_SIZE }, (_, i) => (
        <Card key={i} withBorder radius="md" padding="md">
          <CardSection>
            <Skeleton style={{ aspectRatio: "4 / 3" }} radius={0} />
          </CardSection>
          <Skeleton height={16} mt="md" width="70%" />
          <Skeleton height={12} mt="xs" width="40%" />
          <Skeleton height={12} mt="md" width="50%" />
        </Card>
      ))}
    </SimpleGrid>
  );
}

interface CatalogProps {
  title: string;
  description: string;
  params: SearchParams;
  // Where entries link to: "/inventory" to browse, "/backoffice" to edit
  base?: string;
  addHref?: string;
}

export function Catalog({
  title,
  description,
  params,
  base = "/inventory",
  addHref,
}: CatalogProps) {
  const query = parseCatalogQuery(params);
  const view = parseCatalogView(params);

  return (
    <Stack gap="lg">
      <div>
        <Title order={1}>{title}</Title>
        <Text c="dimmed">{description}</Text>
      </div>
      <CatalogToolbar addHref={addHref} />
      <Suspense
        key={JSON.stringify([query, view])}
        fallback={<CatalogSkeleton view={view} />}
      >
        <CatalogResults query={query} view={view} base={base} />
      </Suspense>
    </Stack>
  );
}
