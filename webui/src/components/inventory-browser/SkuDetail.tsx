import { SimpleGrid, Stack, Text, Textarea, Title } from "@mantine/core";
import { notFound } from "next/navigation";

import {
  imageUrls,
  ITEMS_PAGE_PARAM,
  ITEMS_PAGE_SIZE,
  pageParam,
  type SearchParams,
} from "@/libs/inventory";
import { savePart } from "@/app/backoffice/actions";
import { findPartBySku, getBomTree, listItems } from "@/libs/papiRest";

import { BomSection } from "./BomSection";
import { DetailsEditor } from "./DetailsEditor";
import { InventoryInstances } from "./InventoryInstances";
import { MetadataSection } from "./Metadata";
import { PartGallery } from "./PartGallery";
import { StockCounts } from "./StockCounts";
import { TextLink } from "./TextLink";
import { BomTree } from "./Trees";

interface SkuDetailProps {
  sku: string;
  params: SearchParams;
  // Backoffice: edit details, manage items and the BOM
  editable?: boolean;
}

// SKU page shared by /inventory (browse) and /backoffice (edit)
export async function SkuDetail({ sku, params, editable }: SkuDetailProps) {
  const part = await findPartBySku(decodeURIComponent(sku));
  if (!part) notFound();

  const base = editable ? "/backoffice" : "/inventory";
  const images = imageUrls(part.metadata);
  const page = pageParam(params, ITEMS_PAGE_PARAM);
  const [items, bom] = await Promise.all([
    listItems(part.id, {
      limit: ITEMS_PAGE_SIZE,
      offset: (page - 1) * ITEMS_PAGE_SIZE,
    }),
    getBomTree(part),
  ]);

  return (
    <Stack gap="xl">
      <TextLink href={base}>
        ← Back to {editable ? "inventory management" : "inventory"}
      </TextLink>

      <SimpleGrid
        cols={{ base: 1, sm: images.length > 0 ? 2 : 1 }}
        spacing="xl"
      >
        {images.length > 0 && <PartGallery images={images} alt={part.name} />}
        <Stack gap="sm">
          <Title order={1} size="h2">
            {part.name}
          </Title>
          <Text c="dimmed" ff="monospace">
            {part.sku}
          </Text>
          {!editable && part.description && <Text>{part.description}</Text>}
          {part.stock && <StockCounts stock={part.stock} />}
        </Stack>
      </SimpleGrid>

      {editable ? (
        <DetailsEditor
          title="Details"
          field={
            <Textarea
              name="value"
              label="Description"
              defaultValue={part.description ?? ""}
              autosize
              minRows={2}
            />
          }
          metadata={part.metadata}
          save={savePart.bind(null, part.id)}
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
