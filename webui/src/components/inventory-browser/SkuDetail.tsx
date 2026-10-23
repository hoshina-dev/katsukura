import { Box, Group, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  imageUrls,
  ITEMS_PAGE_PARAM,
  ITEMS_PAGE_SIZE,
  pageParam,
  type SearchParams,
  unitsLabel,
} from "@/libs/inventory";
import { findPartBySku, getBomTree, listItems } from "@/libs/papiRest";

import { BomSection } from "./BomSection";
import { InventoryInstances } from "./InventoryInstances";
import { MetadataSection } from "./Metadata";
import { PartEditor } from "./PartEditor";
import { PartGallery } from "./PartGallery";
import { StockStatus, TypeLabel } from "./StockStatus";
import { BomTree } from "./Trees";

const linkStyle = {
  textDecoration: "none",
  color: "var(--mantine-color-anchor)",
};

interface SkuDetailProps {
  sku: string;
  params: SearchParams;
  // Backoffice: edit details, manage items and the BOM
  editable?: boolean;
}

// Product page shared by /inventory (browse) and /backoffice (edit)
export async function SkuDetail({ sku, params, editable }: SkuDetailProps) {
  const part = await findPartBySku(decodeURIComponent(sku));
  if (!part) notFound();

  const base = editable ? "/backoffice" : "/inventory";
  const isProduct = part.components.length > 0;
  const images = imageUrls(part.metadata);
  const page = pageParam(params, ITEMS_PAGE_PARAM);
  const [items, bom] = await Promise.all([
    listItems(part.id, {
      limit: ITEMS_PAGE_SIZE,
      offset: (page - 1) * ITEMS_PAGE_SIZE,
      publicOnly: !editable,
    }),
    isProduct ? getBomTree(part) : Promise.resolve([]),
  ]);

  return (
    <Stack gap="xl">
      <Link href={base} style={linkStyle}>
        <Text size="sm" component="span">
          ← Back to {editable ? "inventory management" : "inventory"}
        </Text>
      </Link>

      <SimpleGrid
        cols={{ base: 1, sm: images.length > 0 ? 2 : 1 }}
        spacing="xl"
      >
        {images.length > 0 && (
          <Box
            style={{
              borderRadius: "var(--mantine-radius-md)",
              overflow: "hidden",
              border: "1px solid var(--mantine-color-gray-3)",
            }}
          >
            <PartGallery images={images} alt={part.name} />
          </Box>
        )}
        <Stack gap="sm">
          <Group gap="xs">
            <TypeLabel isProduct={isProduct} />
          </Group>
          <Title order={1} size="h2">
            {part.name}
          </Title>
          <Text c="dimmed" ff="monospace">
            {part.sku}
          </Text>
          {!editable && part.description && <Text>{part.description}</Text>}
          <Group gap="sm" mt="sm">
            <StockStatus count={items.total} />
            <Text size="sm" c="dimmed">
              {unitsLabel(items.total)}
            </Text>
          </Group>
        </Stack>
      </SimpleGrid>

      {editable ? (
        <PartEditor
          partId={part.id}
          description={part.description}
          metadata={part.metadata}
        />
      ) : (
        <MetadataSection metadata={part.metadata} />
      )}

      <InventoryInstances
        key={page}
        partId={part.id}
        sku={part.sku}
        items={items.data}
        total={items.total}
        page={page}
        editable={editable}
      />

      <BomSection
        partId={part.id}
        components={part.components}
        editable={editable}
      >
        <BomTree nodes={bom} base={base} />
      </BomSection>
    </Stack>
  );
}
