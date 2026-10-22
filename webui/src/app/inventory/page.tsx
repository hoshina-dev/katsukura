import { Stack, Text, Title } from "@mantine/core";
import { Suspense } from "react";

import { CatalogToolbar } from "@/components/inventory-browser/CatalogControls";
import {
  CatalogResults,
  CatalogSkeleton,
} from "@/components/inventory-browser/CatalogResults";
import { parseCatalogQuery, parseCatalogView } from "@/libs/inventory";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = parseCatalogQuery(params);
  const view = parseCatalogView(params);

  return (
    <Stack gap="lg">
      <div>
        <Title order={1}>Inventory</Title>
        <Text c="dimmed">Browse products, parts, and available stock</Text>
      </div>
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
