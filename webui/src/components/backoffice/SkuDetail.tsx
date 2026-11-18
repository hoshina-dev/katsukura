import { Grid, GridCol, Stack, Text } from "@mantine/core";
import { notFound, redirect } from "next/navigation";

import { savePart } from "@/app/actions";
import {
  imageUrls,
  ITEMS_PAGE_PARAM,
  ITEMS_PAGE_SIZE,
  ITEMS_SEARCH_PARAM,
  pageParam,
  type PartComponent,
  type SearchParams,
  skuHref,
  textParam,
} from "@/libs/inventory";
import { findPartBySku, listItems } from "@/libs/katsukuraApi";

import { BomSection } from "./BomSection";
import { DetailsEditor } from "./DetailsEditor";
import { InventoryInstances } from "./InventoryInstances";
import { IdTag, PageHeader } from "./PageHeader";
import { PartGallery } from "./PartGallery";
import { Section } from "./Section";
import { StockCounts } from "./StockCounts";
import { TextLink } from "./TextLink";

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
  const search = textParam(params, ITEMS_SEARCH_PARAM);
  const items = await listItems(part.id, {
    limit: ITEMS_PAGE_SIZE,
    offset: (page - 1) * ITEMS_PAGE_SIZE,
    search: search || undefined,
  });
  // e.g. the only row on the last page was deleted
  const lastPage = Math.max(1, Math.ceil(items.total / ITEMS_PAGE_SIZE));
  if (items.data.length === 0 && page > lastPage) {
    const next = new URLSearchParams();
    if (search) next.set(ITEMS_SEARCH_PARAM, search);
    if (lastPage > 1) next.set(ITEMS_PAGE_PARAM, String(lastPage));
    const query = next.toString();
    redirect(skuHref(part.sku) + (query ? `?${query}` : ""));
  }
  // Deleted parents keep their BOM rows but no longer use this unit
  const usedIn = part.parents.filter(
    (row) => row.parent_part && !row.parent_part.archived_at,
  );

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
              name={part.name}
              text={{ label: "Description", value: part.description }}
              metadata={part.metadata}
              save={savePart.bind(null, part.id)}
            />
          </Stack>
        </GridCol>
        <GridCol span={{ base: 12, lg: 8 }}>
          <Stack gap="md">
            <InventoryInstances
              partId={part.id}
              sku={part.sku}
              items={items.data}
              total={items.total}
              page={page}
              search={search}
              slots={part.components}
              serialAware={part.serial_aware}
            />
            <BomSection
              partId={part.id}
              components={part.components}
              locked={(part.stock?.total ?? 0) > 0}
            />
            {usedIn.length > 0 && <UsedIn rows={usedIn} />}
          </Stack>
        </GridCol>
      </Grid>
    </Stack>
  );
}

// Units whose bill of materials includes this one
function UsedIn({ rows }: { rows: PartComponent[] }) {
  return (
    <Section title="Used in">
      <Stack gap={6}>
        {rows.map((row) =>
          row.parent_part ? (
            <Text key={row.id} size="sm">
              <TextLink href={skuHref(row.parent_part.sku)}>
                {row.parent_part.name}
              </TextLink>
              <Text span size="xs" c="dimmed" ff="monospace" ml={8}>
                {row.slot} × {row.required_quantity}
              </Text>
            </Text>
          ) : null,
        )}
      </Stack>
    </Section>
  );
}
