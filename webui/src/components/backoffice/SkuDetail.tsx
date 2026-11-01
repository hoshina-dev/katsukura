import { Grid, GridCol, Stack, Textarea } from "@mantine/core";
import { notFound } from "next/navigation";

import { savePart } from "@/app/actions";
import {
  imageUrls,
  ITEMS_PAGE_PARAM,
  ITEMS_PAGE_SIZE,
  pageParam,
  type SearchParams,
} from "@/libs/inventory";
import { findPartBySku, listItems } from "@/libs/papiRest";

import { BomSection } from "./BomSection";
import { DetailsEditor } from "./DetailsEditor";
import { InventoryInstances } from "./InventoryInstances";
import { IdTag, PageHeader } from "./PageHeader";
import { PartGallery } from "./PartGallery";
import { StockCounts } from "./StockCounts";

export async function SkuDetail({
  sku,
  params,
}: {
  sku: string;
  params: SearchParams;
}) {
  const part = await findPartBySku(decodeURIComponent(sku));
  if (!part) notFound();

  const images = imageUrls(part.metadata);
  const page = pageParam(params, ITEMS_PAGE_PARAM);
  const items = await listItems(part.id, {
    limit: ITEMS_PAGE_SIZE,
    offset: (page - 1) * ITEMS_PAGE_SIZE,
  });

  return (
    <Stack gap="lg">
      <PageHeader
        trail={[{ href: "/", label: "Units" }]}
        title={part.name}
        meta={
          <>
            <IdTag>{part.sku}</IdTag>
            {part.stock && <StockCounts stock={part.stock} />}
          </>
        }
      />

      <Grid gutter="md">
        <GridCol span={{ base: 12, lg: 4 }}>
          <Stack gap="md">
            {images.length > 0 && (
              <PartGallery images={images} alt={part.name} />
            )}
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
          </Stack>
        </GridCol>
        <GridCol span={{ base: 12, lg: 8 }}>
          <Stack gap="md">
            <InventoryInstances
              key={page}
              partId={part.id}
              sku={part.sku}
              items={items.data}
              total={items.total}
              page={page}
            />
            <BomSection partId={part.id} components={part.components} />
          </Stack>
        </GridCol>
      </Grid>
    </Stack>
  );
}
